import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index, OneToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { Book } from './Book';

export type ReservationStatus = 'pending' | 'confirmed' | 'completed';

@Entity('reservations')
// 一本书至多保留一条待交接（pending/confirmed）预约：取消时删除记录以释放书籍，
// 完成后预约保留，书籍已售出不会再次开放
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Book)
  @JoinColumn()
  book: Book;

  // 对活跃预约（书籍状态为 reserved）等价于唯一约束，数据库层防止重复留书
  @Column()
  @Index('idx_reservation_book', { unique: true })
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

  // 买家提交时选择的取书时段，例如「2026年9月24日(周三) 上午」
  @Column({ length: 50 })
  pickupSlot: string;

  // 六位数字取书码，买家到店报码、卖家校验
  @Column({ length: 6, select: false })
  pickupCode: string;

  // 卖家确认的碰面地点
  @Column({ nullable: true })
  meetingLocation: string;

  @Column({ type: 'enum', enum: ['pending', 'confirmed', 'completed'], default: 'pending' })
  @Index('idx_reservation_status')
  status: ReservationStatus;

  @CreateDateColumn()
  createdAt: Date;
}
