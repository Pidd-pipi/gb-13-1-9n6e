import request from './request';
import type { MyReservationsResponse, Reservation } from '@/types';

export const createReservation = (bookId: string, pickupSlot: string) => {
  return request.post<{ reservation: Reservation }>('/reservations', { bookId, pickupSlot });
};

export const getMyReservations = () => {
  return request.get<MyReservationsResponse>('/my/reservations');
};

export const confirmLocation = (id: string, meetingLocation: string) => {
  return request.put<{ reservation: Reservation }>(`/reservations/${id}/location`, {
    meetingLocation,
  });
};

export const cancelReservation = (id: string) => {
  return request.put(`/reservations/${id}/cancel`);
};

export const verifyPickupCode = (id: string, pickupCode: string) => {
  return request.put(`/reservations/${id}/verify-code`, { pickupCode });
};
