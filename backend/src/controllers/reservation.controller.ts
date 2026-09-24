import { Response } from 'express';
import { randomInt } from 'crypto';
import { AppDataSource } from '../config/database';
import { Book } from '../entities/Book';
import { Reservation, ReservationStatus } from '../entities/Reservation';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  activeWhere,
  activeReservationRelations,
  serializeReservation,
  serializeMany,
} from '../services/reservation.service';

const reservationRepository = () => AppDataSource.getRepository(Reservation);

const isDupEntry = (error: any) => error?.errno === 1062 || error?.code === 'ER_DUP_ENTRY';

// 买家提交预约：选择取书时段，书籍随即变为已预约
export const createReservation = async (req: AuthenticatedRequest, res: Response) => {
  const bookId = req.body.bookId;
  const pickupSlot = typeof req.body.pickupSlot === 'string' ? req.body.pickupSlot.trim() : '';

  if (!bookId) {
    return res.status(400).json({ message: '缺少书籍信息' });
  }
  if (!pickupSlot) {
    return res.status(400).json({ message: '请选择取书时段' });
  }
  if (pickupSlot.length > 100) {
    return res.status(400).json({ message: '取书时段信息过长' });
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    // 行锁串行化同一本书的并发预约，配合唯一索引保证只有一条待交接预约
    const book = await queryRunner.manager.findOne(Book, {
      where: { id: bookId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!book) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ message: '书籍不存在' });
    }
    if (book.sellerId === req.userId) {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ message: '不能预约自己发布的书籍' });
    }
    if (book.status === 'sold') {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ message: '该书已售出，无法预约' });
    }
    if (book.status === 'reserved') {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ message: '该书已被预约，请选择其他书籍' });
    }

    const reservation = queryRunner.manager.create(Reservation, {
      bookId: book.id,
      buyerId: req.userId!,
      sellerId: book.sellerId,
      pickupSlot,
      status: 'awaiting_location' as ReservationStatus,
      activeBookId: book.id,
    });

    book.status = 'reserved';
    await queryRunner.manager.save(book);

    try {
      await queryRunner.manager.save(reservation);
    } catch (error) {
      if (isDupEntry(error)) {
        await queryRunner.rollbackTransaction();
        return res.status(400).json({ message: '该书已被预约，请选择其他书籍' });
      }
      throw error;
    }

    await queryRunner.commitTransaction();

    const saved = await reservationRepository().findOne({
      where: { id: reservation.id },
      ...activeReservationRelations,
    });
    res.status(201).json({ message: '预约成功，等待卖家确认碰面地点', reservation: serializeReservation(saved!, req.userId!) });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error(error);
    res.status(500).json({ message: '预约失败，请稍后重试' });
  } finally {
    await queryRunner.release();
  }
};

// 我的预约：role=seller 为卖家视角（含买家联系方式），role=buyer 为买家视角（含取书码）
export const getMyReservations = async (req: AuthenticatedRequest, res: Response) => {
  const role = req.query.role === 'seller' ? 'seller' : 'buyer';
  const where = role === 'seller' ? { sellerId: req.userId } : { buyerId: req.userId };

  const reservations = await reservationRepository().find({
    where,
    ...activeReservationRelations,
    order: { updatedAt: 'DESC', createdAt: 'DESC' },
  });

  res.json({ reservations: serializeMany(reservations, req.userId!) });
};

// 书籍详情页查询与当前用户相关的待交接预约（买家的预约 / 卖家收到的预约）
export const getBookReservation = async (req: AuthenticatedRequest, res: Response) => {
  const { bookId } = req.params;

  const reservation = await reservationRepository().findOne({
    where: [
      activeWhere({ bookId, buyerId: req.userId! }),
      activeWhere({ bookId, sellerId: req.userId! }),
    ],
    ...activeReservationRelations,
    order: { createdAt: 'DESC' },
  });

  res.json({ reservation: reservation ? serializeReservation(reservation, req.userId!) : null });
};

// 卖家确认碰面地点：确认后生成六位取书码，买家可见、卖家不可见
export const confirmMeetLocation = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const meetLocation = typeof req.body.meetLocation === 'string' ? req.body.meetLocation.trim() : '';

  if (!meetLocation) {
    return res.status(400).json({ message: '请填写碰面地点' });
  }
  if (meetLocation.length > 200) {
    return res.status(400).json({ message: '碰面地点信息过长' });
  }

  const repo = reservationRepository();
  const reservation = await repo.findOne({ where: { id }, ...activeReservationRelations });

  if (!reservation) {
    return res.status(404).json({ message: '预约不存在' });
  }
  if (reservation.sellerId !== req.userId) {
    return res.status(403).json({ message: '只有卖家可以确认碰面地点' });
  }
  if (reservation.status === 'cancelled') {
    return res.status(400).json({ message: '该预约已取消' });
  }
  if (reservation.status === 'completed') {
    return res.status(400).json({ message: '该预约已完成交接' });
  }
  if (reservation.status === 'awaiting_handover') {
    return res.status(400).json({ message: '已确认过碰面地点' });
  }

  reservation.meetLocation = meetLocation;
  // 六位数字取书码，首位允许为 0
  reservation.pickupCode = String(randomInt(0, 1000000)).padStart(6, '0');
  reservation.status = 'awaiting_handover';
  await repo.save(reservation);

  res.json({ message: '碰面地点已确认，等待买家到店报码', reservation: serializeReservation(reservation, req.userId!) });
};

// 任一方取消：预约作废、书籍恢复可购买
export const cancelReservation = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    const reservation = await queryRunner.manager.findOne(Reservation, {
      where: { id },
      relations: ['book', 'buyer', 'seller'],
      lock: { mode: 'pessimistic_write' },
    });

    if (!reservation) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ message: '预约不存在' });
    }
    if (reservation.buyerId !== req.userId && reservation.sellerId !== req.userId) {
      await queryRunner.rollbackTransaction();
      return res.status(403).json({ message: '只有预约双方可以取消' });
    }
    if (reservation.status === 'cancelled') {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ message: '该预约已取消' });
    }
    if (reservation.status === 'completed') {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ message: '该预约已完成交接，无法取消' });
    }

    reservation.status = 'cancelled';
    reservation.cancelledBy = reservation.buyerId === req.userId ? 'buyer' : 'seller';
    reservation.activeBookId = null;
    await queryRunner.manager.save(reservation);

    const book = await queryRunner.manager.findOne(Book, {
      where: { id: reservation.bookId },
      lock: { mode: 'pessimistic_write' },
    });
    if (book && book.status === 'reserved') {
      book.status = 'available';
      await queryRunner.manager.save(book);
    }

    await queryRunner.commitTransaction();
    res.json({ message: '预约已取消，书籍已恢复可购买', reservation: serializeReservation(reservation, req.userId!) });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error(error);
    res.status(500).json({ message: '取消失败，请稍后重试' });
  } finally {
    await queryRunner.release();
  }
};

// 卖家校验取书码：正确才标记已售出，错误则预约和书籍均保持原状
export const verifyPickupCode = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const code = req.body.code === undefined || req.body.code === null ? '' : String(req.body.code).trim();

  if (!/^\d{1,6}$/.test(code)) {
    return res.status(400).json({ message: '请输入六位数字取书码' });
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    const reservation = await queryRunner.manager.findOne(Reservation, {
      where: { id },
      relations: ['book', 'buyer', 'seller'],
      lock: { mode: 'pessimistic_write' },
    });

    if (!reservation) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ message: '预约不存在' });
    }
    if (reservation.sellerId !== req.userId) {
      await queryRunner.rollbackTransaction();
      return res.status(403).json({ message: '只有卖家可以校验取书码' });
    }
    if (reservation.status === 'cancelled') {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ message: '该预约已取消' });
    }
    if (reservation.status === 'completed') {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ message: '该预约已完成交接' });
    }
    if (reservation.status === 'awaiting_location') {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ message: '请先确认碰面地点' });
    }

    const padded = code.padStart(6, '0');
    if (reservation.pickupCode !== padded) {
      // 校验失败：不做任何状态变更，预约和书籍保持原状
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ message: '取书码错误，请让买家核对后重新报码' });
    }

    reservation.status = 'completed';
    reservation.activeBookId = null;
    await queryRunner.manager.save(reservation);

    const book = await queryRunner.manager.findOne(Book, {
      where: { id: reservation.bookId },
      lock: { mode: 'pessimistic_write' },
    });
    if (book) {
      book.status = 'sold';
      await queryRunner.manager.save(book);
    }

    await queryRunner.commitTransaction();
    res.json({ message: '取书码正确，交易已完成', reservation: serializeReservation(reservation, req.userId!) });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error(error);
    res.status(500).json({ message: '校验失败，请稍后重试' });
  } finally {
    await queryRunner.release();
  }
};
