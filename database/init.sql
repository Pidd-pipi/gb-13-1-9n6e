CREATE DATABASE IF NOT EXISTS campus_bookstore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 预约交接表
-- 说明：应用启动时 TypeORM synchronize 会自动创建/更新表结构；
-- 此处 DDL 供手工建库参考。取书码列不随普通查询返回（实体 select:false）。
-- 一本书至多存在一条预约记录：取消即删除行以释放书籍；完成后保留记录，书籍已售出。
CREATE TABLE IF NOT EXISTS campus_bookstore.reservations (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  bookId VARCHAR(36) NOT NULL,
  buyerId VARCHAR(36) NOT NULL,
  sellerId VARCHAR(36) NOT NULL,
  pickupSlot VARCHAR(50) NOT NULL COMMENT '买家选择的取书时段',
  pickupCode VARCHAR(6) NOT NULL COMMENT '六位数字取书码',
  meetingLocation VARCHAR(255) NULL COMMENT '卖家确认的碰面地点',
  status ENUM('pending', 'confirmed', 'completed') NOT NULL DEFAULT 'pending'
    COMMENT 'pending=待确认地点 confirmed=待交接 completed=已完成',
  createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE INDEX idx_reservation_book (bookId),
  INDEX idx_reservation_buyer (buyerId),
  INDEX idx_reservation_seller (sellerId),
  INDEX idx_reservation_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
