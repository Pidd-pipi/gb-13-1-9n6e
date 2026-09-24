<template>
  <div class="detail-page">
    <van-nav-bar title="书籍详情" left-arrow @click-left="router.back" />

    <van-loading v-if="loading" class="loading-center" />

    <div v-else-if="book" class="detail-body">
      <van-swipe class="detail-images" :autoplay="3000" indicator-color="white">
        <van-swipe-item v-for="(image, index) in book.images" :key="index">
          <van-image :src="image" fit="cover" width="100%" height="300px" />
        </van-swipe-item>
      </van-swipe>

      <div class="detail-header">
        <div class="detail-title">{{ book.title }}</div>
        <div class="detail-price-section">
          <span class="detail-price">¥{{ book.price }}</span>
          <span class="detail-original-price">¥{{ book.originalPrice }}</span>
          <van-tag :class="`status-${book.status}`" type="success" v-if="book.status === 'available'">可购买</van-tag>
          <van-tag v-else-if="book.status === 'reserved'" type="warning">已预约</van-tag>
          <van-tag v-else type="default">已售出</van-tag>
        </div>

        <div class="detail-meta">
          <span class="detail-meta-item">作者：{{ book.author }}</span>
          <span class="detail-meta-item">新旧：{{ conditionMap[book.condition] }}</span>
          <span class="detail-meta-item">分类：{{ categoryMap[book.category] }}</span>
          <span class="detail-meta-item">交易：{{ tradeMethodMap[book.tradeMethod] }}</span>
          <span class="detail-meta-item">校区：{{ book.campus }}</span>
          <span v-if="book.isbn" class="detail-meta-item">ISBN：{{ book.isbn }}</span>
        </div>

        <div class="detail-desc" v-if="book.description">
          <h4>描述</h4>
          <p>{{ book.description }}</p>
        </div>
      </div>

      <div class="detail-seller" v-if="book.seller">
        <van-image
          round
          width="48"
          height="48"
          :src="book.seller.avatarUrl || 'https://img.yzcdn.cn/vant/user-inactive.png'"
        />
        <div class="seller-detail">
          <div class="seller-name">
            {{ book.seller.name || '匿名用户' }}
            <span v-if="book.seller.positiveRatingRate < 60" class="risk-badge">风险提示</span>
          </div>
          <div class="seller-department">
            {{ book.seller.department || '未填写院系' }}
            <span class="rating-badge" v-if="book.seller.totalReviews > 0">
              好评率 {{ book.seller.positiveRatingRate }}%
            </span>
          </div>
        </div>
        <van-button type="primary" size="small" round @click="viewReviews">评价({{ book.seller.totalReviews }})</van-button>
      </div>

      <!-- 当前用户的待交接预约卡片 -->
      <div v-if="myReservation" class="reservation-card">
        <div class="reservation-card-header">
          <span class="reservation-card-title">预约信息</span>
          <van-tag :type="myReservation.status === 'awaiting_location' ? 'warning' : 'primary'">
            {{ reservationStatusMap[myReservation.status] }}
          </van-tag>
        </div>
        <div class="reservation-row"><span>取书时段</span><b>{{ myReservation.pickupSlot }}</b></div>

        <!-- 买家视角 -->
        <template v-if="!isOwner && myReservation.buyerId === authStore.user?.id">
          <div class="reservation-row">
            <span>碰面地点</span>
            <b v-if="myReservation.meetLocation">{{ myReservation.meetLocation }}</b>
            <i v-else>等待卖家确认</i>
          </div>
          <div v-if="myReservation.pickupCode" class="pickup-code-box">
            <div class="pickup-code-label">到店后向卖家报以下六位取书码</div>
            <div class="pickup-code">{{ myReservation.pickupCode }}</div>
          </div>
          <div v-else-if="myReservation.status === 'awaiting_location'" class="reservation-tip">
            卖家确认碰面地点后，将在此显示六位取书码
          </div>
          <van-button plain type="danger" size="small" block @click="onCancel(myReservation)">取消预约</van-button>
        </template>

        <!-- 卖家视角：看不到取书码 -->
        <template v-else-if="isOwner">
          <div class="reservation-row" v-if="myReservation.buyer">
            <span>预约买家</span>
            <b>{{ myReservation.buyer.name || myReservation.buyer.studentId || '匿名用户' }}</b>
          </div>
          <div class="reservation-row">
            <span>买家联系方式</span>
            <b v-if="myReservation.buyer?.contactInfo">{{ myReservation.buyer.contactInfo }}</b>
            <i v-else>买家未填写联系方式</i>
          </div>
          <van-button type="primary" size="small" block @click="router.push('/my-reservations?role=seller')">
            前往处理交接
          </van-button>
        </template>
      </div>

      <!-- 其他买家看到的已预约提示 -->
      <div v-else-if="book.status === 'reserved' && !isOwner" class="reserved-notice">
        该书已有待交接预约，请看看其他书籍吧
      </div>

      <!-- 卖家自己看到的已预约提示 -->
      <div v-if="book.status === 'reserved' && isOwner && !myReservation" class="reserved-notice">
        该书已被预约，可在“我的预约”中处理交接
      </div>

      <div class="bottom-actions">
        <van-button icon="star-o" :type="isFavorite ? 'warning' : 'default'" @click="toggleFavorite">
          {{ isFavorite ? '已收藏' : '收藏' }}
        </van-button>
        <van-button
          v-if="book.status === 'available' && !isOwner"
          type="warning"
          @click="openReservePopup"
        >
          预约取书
        </van-button>
        <van-button
          type="primary"
          :disabled="book.status !== 'available' || isOwner"
          @click="contactSeller"
        >
          {{ isOwner ? '这是我发布的' : '联系卖家' }}
        </van-button>
      </div>
    </div>

    <van-empty v-else description="书籍不存在" />

    <!-- 取书时段选择 -->
    <van-popup v-model:show="showReservePopup" position="bottom" round>
      <div class="reserve-popup">
        <van-nav-bar title="选择取书时段" :left-arrow="false" />
        <div class="slot-section">
          <div class="slot-label">取书日期</div>
          <div class="slot-chips">
            <span
              v-for="day in dayOptions"
              :key="day.value"
              class="slot-chip"
              :class="{ active: selectedDay === day.value }"
              @click="selectedDay = day.value"
            >
              {{ day.label }}
            </span>
          </div>
        </div>
        <div class="slot-section">
          <div class="slot-label">取书时间</div>
          <van-radio-group v-model="selectedTime">
            <div class="slot-chips">
              <span
                v-for="t in timeOptions"
                :key="t"
                class="slot-chip"
                :class="{ active: selectedTime === t }"
                @click="selectedTime = t"
              >
                {{ t }}
              </span>
            </div>
          </van-radio-group>
        </div>
        <div class="reserve-submit">
          <van-button type="primary" block round :loading="submitting" @click="submitReservation">
            提交预约
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { getBookById, toggleFavorite as apiToggleFavorite } from '@/api/book';
import { createReservation, cancelReservation as apiCancelReservation } from '@/api/reservation';
import { useAuthStore } from '@/store/auth';
import type { Book, Reservation } from '@/types';
import { conditionMap, categoryMap, tradeMethodMap, reservationStatusMap } from '@/types';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const book = ref<Book | null>(null);
const isFavorite = ref(false);

const showReservePopup = ref(false);
const submitting = ref(false);
const selectedDay = ref('');
const selectedTime = ref('');

const isOwner = computed(() => book.value?.sellerId === authStore.user?.id);
const myReservation = computed<Reservation | null>(() => book.value?.reservation ?? null);

const timeOptions = ['09:00-11:00', '11:00-13:00', '13:00-15:00', '15:00-17:00', '17:00-19:00'];

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const dayOptions = computed(() => {
  const list: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const value = `${d.getMonth() + 1}月${d.getDate()}日`;
    list.push({
      value,
      label: i === 0 ? `今天 ${value}` : i === 1 ? `明天 ${value}` : `${weekdayNames[d.getDay()]} ${value}`,
    });
  }
  return list;
});

const fetchBook = async () => {
  loading.value = true;
  try {
    book.value = await getBookById(route.params.id as string);
  } finally {
    loading.value = false;
  }
};

const toggleFavorite = async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  try {
    const result = await apiToggleFavorite(book.value!.id);
    isFavorite.value = result.isFavorite;
    showToast(result.isFavorite ? '收藏成功' : '已取消收藏');
  } catch {}
};

const contactSeller = () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  if (!book.value?.seller) return;
  router.push(`/chat/${book.value.seller.id}?bookId=${book.value.id}`);
};

const openReservePopup = () => {
  if (!authStore.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath } });
    return;
  }
  selectedDay.value = dayOptions.value[0].value;
  selectedTime.value = timeOptions[0];
  showReservePopup.value = true;
};

const submitReservation = async () => {
  if (!selectedDay.value || !selectedTime.value) {
    showToast('请选择完整的取书时段');
    return;
  }
  submitting.value = true;
  try {
    await createReservation(book.value!.id, `${selectedDay.value} ${selectedTime.value}`);
    showToast('预约成功，等待卖家确认碰面地点');
    showReservePopup.value = false;
    await fetchBook();
  } catch {
    // 失败提示已由请求拦截器统一展示
  } finally {
    submitting.value = false;
  }
};

const onCancel = async (reservation: Reservation) => {
  try {
    await showConfirmDialog({
      title: '确认取消预约',
      message: '取消后该书将恢复可购买，确定取消吗？',
    });
  } catch {
    return;
  }
  try {
    await apiCancelReservation(reservation.id);
    showToast('预约已取消');
    await fetchBook();
  } catch {}
};

const viewReviews = () => {
  if (!book.value?.seller) return;
  showToast('请在个人中心查看更多评价功能');
};

onMounted(fetchBook);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.detail-body {
  padding-bottom: 80px;
}
.detail-images {
  width: 100%;
  height: 300px;
}
.detail-header {
  padding: 16px;
}
.detail-title {
  font-size: 18px;
  font-weight: 500;
  color: #1a1a1a;
}
.detail-price-section {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.detail-price {
  font-size: 24px;
  font-weight: bold;
  color: #ff4d4f;
}
.detail-original-price {
  font-size: 14px;
  color: #999;
  text-decoration: line-through;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.detail-meta-item {
  font-size: 13px;
  color: #666;
  background: #f7f8fa;
  padding: 4px 8px;
  border-radius: 4px;
}
.detail-desc {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}
.detail-desc h4 {
  font-size: 14px;
  color: #1a1a1a;
  margin-bottom: 8px;
}
.detail-desc p {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}
.detail-seller {
  display: flex;
  align-items: center;
  padding: 16px;
  border-top: 8px solid #f7f8fa;
}
.seller-detail {
  flex: 1;
  margin-left: 12px;
}
.seller-name {
  font-size: 15px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}
.risk-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: #fff1f0;
  color: #f5222d;
  border-radius: 4px;
}
.seller-department {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rating-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: #fff7e6;
  color: #fa8c16;
}
.status-available {
  background: #52c41a !important;
}
.status-reserved {
  background: #faad14 !important;
}
.status-sold {
  background: #d9d9d9 !important;
}
.reserved-notice {
  margin: 0 16px 16px;
  padding: 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 8px;
  color: #ad6800;
  font-size: 13px;
  text-align: center;
}
.reservation-card {
  margin: 0 16px 16px;
  padding: 16px;
  background: white;
  border: 1px solid #ebedf0;
  border-radius: 8px;
}
.reservation-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.reservation-card-title {
  font-size: 15px;
  font-weight: 500;
  color: #1a1a1a;
}
.reservation-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  gap: 12px;
}
.reservation-row b {
  color: #1a1a1a;
  font-weight: 500;
  text-align: right;
}
.reservation-row i {
  color: #999;
  font-style: normal;
}
.reservation-tip {
  font-size: 12px;
  color: #999;
  margin: 4px 0 12px;
}
.pickup-code-box {
  text-align: center;
  background: #f0f9ff;
  border: 1px dashed #1989fa;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.pickup-code-label {
  font-size: 12px;
  color: #1989fa;
}
.pickup-code {
  font-size: 30px;
  font-weight: bold;
  letter-spacing: 8px;
  color: #1989fa;
  margin-top: 4px;
  font-family: 'Courier New', monospace;
}
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: white;
  display: flex;
  gap: 12px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}
.bottom-actions .van-button {
  flex: 1;
}
.reserve-popup {
  padding-bottom: 20px;
}
.slot-section {
  padding: 12px 16px 0;
}
.slot-label {
  font-size: 14px;
  color: #323233;
  margin-bottom: 10px;
}
.slot-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.slot-chip {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 16px;
  background: #f2f3f5;
  color: #323233;
  font-size: 13px;
}
.slot-chip.active {
  background: #e8f3ff;
  color: #1989fa;
  border: 1px solid #1989fa;
}
.reserve-submit {
  padding: 20px 16px 4px;
}
</style>
