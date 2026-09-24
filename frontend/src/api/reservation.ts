import request from './request';
import type { Reservation } from '@/types';

export const createReservation = (bookId: string, pickupSlot: string) => {
  return request.post<{ message: string; reservation: Reservation }>('/reservations', {
    bookId,
    pickupSlot,
  });
};

export const getMyReservations = (role: 'buyer' | 'seller') => {
  return request.get<{ reservations: Reservation[] }>('/my/reservations', { params: { role } });
};

export const getBookReservation = (bookId: string) => {
  return request.get<{ reservation: Reservation | null }>(`/books/${bookId}/reservation`);
};

export const confirmMeetLocation = (id: string, meetLocation: string) => {
  return request.put<{ message: string; reservation: Reservation }>(`/reservations/${id}/location`, {
    meetLocation,
  });
};

export const cancelReservation = (id: string) => {
  return request.put<{ message: string; reservation: Reservation }>(`/reservations/${id}/cancel`);
};

export const verifyPickupCode = (id: string, code: string) => {
  return request.put<{ message: string; reservation: Reservation }>(`/reservations/${id}/verify`, {
    code,
  });
};
