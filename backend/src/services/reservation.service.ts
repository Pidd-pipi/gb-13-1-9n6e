import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Reservation, ACTIVE_RESERVATION_STATUSES } from '../entities/Reservation';

const reservationRepository = () => AppDataSource.getRepository(Reservation);

export const activeWhere = (extra: Record<string, string>) => ({
  ...extra,
  status: In(ACTIVE_RESERVATION_STATUSES),
});

const buyerSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  department: true,
  contactInfo: true,
  studentId: true,
};

const sellerSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  department: true,
  contactInfo: true,
};

/** 按当前用户视角序列化预约：卖家永远看不到取书码，买家仅在卖家确认地点后可见 */
export const serializeReservation = (reservation: Reservation, currentUserId: string) => {
  const isSeller = currentUserId === reservation.sellerId;
  const { pickupCode, ...rest } = reservation;
  return {
    ...rest,
    pickupCode:
      !isSeller &&
      (reservation.status === 'awaiting_handover' || reservation.status === 'completed')
        ? pickupCode
        : undefined,
  };
};

export const serializeMany = (reservations: Reservation[], currentUserId: string) =>
  reservations.map((r) => serializeReservation(r, currentUserId));

export const activeReservationRelations = {
  relations: ['book', 'buyer', 'seller'],
  select: { buyer: buyerSelect, seller: sellerSelect },
};

// 书籍详情页查询与当前用户相关的待交接预约（未登录/无关用户返回 null）
export const findRelatedActiveReservation = async (bookId: string, userId?: string) => {
  if (!userId) return null;
  const reservation = await reservationRepository().findOne({
    where: [activeWhere({ bookId, buyerId: userId }), activeWhere({ bookId, sellerId: userId })],
    ...activeReservationRelations,
    order: { createdAt: 'DESC' },
  });
  return reservation ? serializeReservation(reservation, userId) : null;
};

// 是否存在待交接预约（用于书籍状态/删除接口的保护）
export const hasActiveReservation = async (bookId: string) =>
  reservationRepository().exist({
    where: { bookId, activeBookId: bookId },
  });
