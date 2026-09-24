import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from './User';
import { Book } from './Book';

export type ReservationStatus = 'awaiting_location' | 'awaiting_handover' | 'completed' | 'cancelled';
export type CancelledBy = 'buyer' | 'seller';

export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = ['awaiting_location', 'awaiting_handover'];

@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  pickupSlot: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  meetLocation: string;

  @Column({ type: 'varchar', length: 6, nullable: true })
  pickupCode: string;

  @Column({
    type: 'enum',
    enum: ['awaiting_location', 'awaiting_handover', 'completed', 'cancelled'],
    default: 'awaiting_location',
  })
  @Index('idx_reservation_status')
  status: ReservationStatus;

  @Column({ type: 'enum', enum: ['buyer', 'seller'], nullable: true })
  cancelledBy: CancelledBy | null;

  @ManyToOne(() => Book)
  book: Book;

  @Column()
  @Index('idx_reservation_book')
  bookId: string;

  @ManyToOne(() => User)
  buyer: User;

  @Column()
  @Index('idx_reservation_buyer')
  buyerId: string;

  @ManyToOne(() => User)
  seller: User;

  @Column()
  @Index('idx_reservation_seller')
  sellerId: string;

  // 仅在待交接状态下等于 bookId，其余状态置空，配合唯一索引保证同一本书只有一条待交接预约
  @Column({ nullable: true, unique: true })
  activeBookId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
