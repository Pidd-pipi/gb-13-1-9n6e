import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Book } from '../entities/Book';
import { Reservation, ReservationStatus } from '../entities/Reservation';
import { User } from '../entities/User';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

interface ReservationRelations {
  book?: Book;
  buyer?: User;
  seller?: User;
}

/**
 * 按当前查看者身份序列化预约：
 * - 取书码仅买家可见，卖家确认碰面地点（pending 结束）后展示
 * - 买家联系方式仅卖家可见，且确认地点后才展示
 */
export const serializeReservation = (
  reservation: Reservation & ReservationRelations,
  viewerId: string
) => {
  const isBuyer = reservation.buyerId === viewerId;
  const isSeller = reservation.sellerId === viewerId;
  const locationConfirmed = reservation.status !== 'pending';

  return {
    id: reservation.id,
    bookId: reservation.bookId,
    buyerId: reservation.buyerId,
    sellerId: reservation.sellerId,
    pickupSlot: reservation.pickupSlot,
    meetingLocation: reservation.meetingLocation,
    status: reservation.status,
    createdAt: reservation.createdAt,
    codeVisible: isBuyer && locationConfirmed,
    pickupCode: isBuyer && locationConfirmed ? reservation.pickupCode : undefined,
    buyer: reservation.buyer
      ? {
          id: reservation.buyer.id,
          name: reservation.buyer.name || '未设置昵称',
          avatarUrl: reservation.buyer.avatarUrl,
          department: reservation.buyer.department,
          // 卖家在确认地点后才能看到买家联系方式
          contactInfo:
            isSeller && reservation.status !== 'pending'
              ? reservation.buyer.contactInfo || ''
              : '',
        }
      : undefined,
    book: reservation.book
      ? {
          id: reservation.book.id,
          title: reservation.book.title,
          price: reservation.book.price,
          images: reservation.book.images,
          status: reservation.book.status,
          campus: reservation.book.campus,
        }
      : undefined,
  };
};

/** 查询某本书当前的待交接/已完成预约（取消的预约已删除，查不到即代表可购买） */
export const findReservationByBookId = async (bookId: string, withCode = false) => {
  const qb = AppDataSource.getRepository(Reservation)
    .createQueryBuilder('reservation')
    .where('reservation.bookId = :bookId', { bookId });
  if (withCode) {
    qb.addSelect('reservation.pickupCode');
  }
  return qb.getOne();
};

const loadReservationDetails = async (
  whereKey: 'buyerId' | 'sellerId',
  viewerId: string,
  includeCode: boolean
) => {
  const qb = AppDataSource.getRepository(Reservation)
    .createQueryBuilder('reservation')
    .leftJoinAndSelect('reservation.buyer', 'buyer')
    .leftJoinAndSelect('reservation.seller', 'seller')
    .leftJoinAndSelect('reservation.book', 'book')
    .where(`reservation.${whereKey} = :viewerId`, { viewerId })
    .orderBy('reservation.createdAt', 'DESC');
  // 买家列表中的预约当前用户都是买家，取码安全；卖家列表不取码（select:false 默认不查）
  if (includeCode) {
    qb.addSelect('reservation.pickupCode');
  }
  const list = await qb.getMany();
  return list.map((item) => serializeReservation(item, viewerId));
};

const generatePickupCode = () => {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
};

/** 加载含取书码及全部关联的单条预约（不存在时返回 null） */
export const getFullReservationById = async (id: string, withCode = true) => {
  const qb = AppDataSource.getRepository(Reservation)
    .createQueryBuilder('reservation')
    .leftJoinAndSelect('reservation.buyer', 'buyer')
    .leftJoinAndSelect('reservation.seller', 'seller')
    .leftJoinAndSelect('reservation.book', 'book')
    .where('reservation.id = :id', { id });
  if (withCode) {
    qb.addSelect('reservation.pickupCode');
  }
  return qb.getOne();
};

const getFullReservation = (id: string) => getFullReservationById(id, true);

/** 事务内提前结束并返回 HTTP 错误的哨兵 */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** 买家提交预约：选择取书时段，书籍随即变为已预约 */
export const createReservation = async (req: AuthenticatedRequest, res: Response) => {
  const { bookId, pickupSlot } = req.body;

  if (!bookId) {
    return res.status(400).json({ message: '缺少书籍信息' });
  }
  if (!pickupSlot || typeof pickupSlot !== 'string' || pickupSlot.trim().length === 0) {
    return res.status(400).json({ message: '请选择取书时段' });
  }

  try {
    const reservationId = await AppDataSource.transaction(async (manager) => {
      // 行锁锁定书籍，防止同一本书被并发重复留书
      const book = await manager
        .getRepository(Book)
        .createQueryBuilder('book')
        .setLock('pessimistic_write')
        .where('book.id = :id', { id: bookId })
        .getOne();

      if (!book) {
        throw new HttpError(404, '书籍不存在');
      }
      if (book.sellerId === req.userId) {
        throw new HttpError(400, '不能预约自己发布的书籍');
      }
      if (book.status === 'sold') {
        throw new HttpError(400, '该书已售出，无法预约');
      }
      if (book.status === 'reserved') {
        throw new HttpError(400, '该书已被预约，请选择其他书籍');
      }

      const existed = await manager.getRepository(Reservation).findOne({ where: { bookId } });
      if (existed) {
        throw new HttpError(400, '该书已存在预约，无法重复留书');
      }

      book.status = 'reserved';
      await manager.save(book);

      const reservation = manager.getRepository(Reservation).create({
        bookId,
        buyerId: req.userId!,
        sellerId: book.sellerId,
        pickupSlot: pickupSlot.trim(),
        pickupCode: generatePickupCode(),
        status: 'pending' as ReservationStatus,
      });
      await manager.save(reservation);
      return reservation.id;
    });

    const reservation = await getFullReservation(reservationId);
    res.status(201).json({
      message: '预约提交成功，等待卖家确认碰面地点',
      reservation: serializeReservation(reservation!, req.userId!),
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    // 唯一索引兜底并发：ER_DUP_ENTRY
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: '该书已被预约，请选择其他书籍' });
    }
    console.error(error);
    res.status(500).json({ message: '预约失败，请稍后重试' });
  }
};

/** 我的预约：买家身份 + 卖家身份分组返回 */
export const getMyReservations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [asBuyer, asSeller] = await Promise.all([
      loadReservationDetails('buyerId', req.userId!, true),
      loadReservationDetails('sellerId', req.userId!, false),
    ]);
    res.json({ asBuyer, asSeller });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '获取预约信息失败' });
  }
};

/** 卖家确认碰面地点（确认后买家可见六位取书码，卖家可见买家联系方式） */
export const confirmLocation = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { meetingLocation } = req.body;

  if (!meetingLocation || typeof meetingLocation !== 'string' || meetingLocation.trim().length === 0) {
    return res.status(400).json({ message: '请填写碰面地点' });
  }

  try {
    const repo = AppDataSource.getRepository(Reservation);
    const reservation = await repo.findOne({ where: { id } });

    if (!reservation) {
      return res.status(404).json({ message: '预约不存在或已取消' });
    }
    if (reservation.sellerId !== req.userId) {
      return res.status(403).json({ message: '只有卖家可以确认碰面地点' });
    }
    if (reservation.status === 'completed') {
      return res.status(400).json({ message: '该预约已完成交接' });
    }

    const firstConfirm = reservation.status === 'pending';
    reservation.meetingLocation = meetingLocation.trim();
    reservation.status = 'confirmed';
    await repo.save(reservation);

    const full = await getFullReservation(id);
    res.json({
      message: firstConfirm
        ? '碰面地点已确认，买家可查看取书码'
        : '碰面地点已更新，买家可查看最新地点',
      reservation: serializeReservation(full!, req.userId!),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '确认碰面地点失败' });
  }
};

/** 买家或卖家取消预约：删除预约并把书籍恢复为可购买 */
export const cancelReservation = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const message = await AppDataSource.transaction(async (manager) => {
      const reservation = await manager
        .getRepository(Reservation)
        .createQueryBuilder('reservation')
        .setLock('pessimistic_write')
        .where('reservation.id = :id', { id })
        .getOne();

      if (!reservation) {
        throw new HttpError(404, '预约不存在或已取消');
      }
      if (reservation.buyerId !== req.userId && reservation.sellerId !== req.userId) {
        throw new HttpError(403, '只有预约双方可以取消');
      }
      if (reservation.status === 'completed') {
        throw new HttpError(400, '已完成交接的预约不能取消');
      }

      const book = await manager
        .getRepository(Book)
        .createQueryBuilder('book')
        .setLock('pessimistic_write')
        .where('book.id = :id', { id: reservation.bookId })
        .getOne();

      if (book) {
        book.status = 'available';
        await manager.save(book);
      }
      await manager.delete(Reservation, { id });

      return reservation.buyerId === req.userId
        ? '已取消预约，书籍恢复可购买'
        : '已取消预约，书籍已重新上架';
    });

    res.json({ message });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: '取消预约失败' });
  }
};

/** 买家到店报码，卖家校验：正确才标记已售出；输错时预约与书籍都保持原状 */
export const verifyPickupCode = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { pickupCode } = req.body;

  if (!pickupCode || !/^\d{6}$/.test(String(pickupCode).trim())) {
    return res.status(400).json({ message: '请输入六位数字取书码' });
  }

  try {
    const result = await AppDataSource.transaction(async (manager) => {
      const reservation = await manager
        .getRepository(Reservation)
        .createQueryBuilder('reservation')
        .addSelect('reservation.pickupCode')
        .setLock('pessimistic_write')
        .where('reservation.id = :id', { id })
        .getOne();

      if (!reservation) {
        throw new HttpError(404, '预约不存在或已取消');
      }
      if (reservation.sellerId !== req.userId) {
        throw new HttpError(403, '只有卖家可以校验取书码');
      }
      if (reservation.status === 'pending') {
        throw new HttpError(400, '请先确认碰面地点后再校验取书码');
      }
      if (reservation.status === 'completed') {
        throw new HttpError(400, '该预约已完成交接');
      }

      if (reservation.pickupCode !== String(pickupCode).trim()) {
        // 校验失败：不改任何状态，预约和书籍保持原状
        throw new HttpError(400, '取书码不正确，请与买家核对后重试');
      }

      reservation.status = 'completed';
      await manager.save(reservation);

      const book = await manager
        .getRepository(Book)
        .createQueryBuilder('book')
        .setLock('pessimistic_write')
        .where('book.id = :id', { id: reservation.bookId })
        .getOne();
      if (book) {
        book.status = 'sold';
        await manager.save(book);
      }

      return '取书码正确，已标记为已售出';
    });

    res.json({ message: result });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: '校验取书码失败' });
  }
};
