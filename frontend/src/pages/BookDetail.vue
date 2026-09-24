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

      <!-- 预约交接信息 -->
      <div class="reservation-card" v-if="book.reservation">
        <template v-if="isReservationBuyer">
          <!-- 买家视角 -->
          <div class="reservation-header">
            <van-icon name="passed" color="#1989fa" size="18" />
            <span class="reservation-title">我的预约</span>
            <van-tag type="warning" v-if="book.reservation.status === 'pending'">待卖家确认地点</van-tag>
            <van-tag type="primary" v-else-if="book.reservation.status === 'confirmed'">待交接</van-tag>
            <van-tag type="success" v-else>已完成</van-tag>
          </div>
          <van-cell title="取书时段" :value="book.reservation.pickupSlot" />
          <van-cell title="碰面地点" :value="book.reservation.meetingLocation || '卖家尚未确认'" />
          <div class="code-area" v-if="book.reservation.status === 'confirmed'">
            <div class="code-label">六位取书码（到店向卖家报码）</div>
            <div class="code-value">{{ book.reservation.pickupCode }}</div>
          </div>
          <div class="code-pending" v-else-if="book.reservation.status === 'pending'">
            卖家确认碰面地点后，这里将显示六位取书码
          </div>
          <div class="reservation-actions" v-if="book.reservation.status !== 'completed'">
            <van-button plain type="danger" size="small" @click="onCancelReservation(book.reservation!.id)">
              取消预约
            </van-button>
          </div>
        </template>

        <template v-else-if="isOwner">
          <!-- 卖家视角：详情页仅提示，具体操作在「我的预约」 -->
          <div class="reservation-header">
            <van-icon name="records" color="#fa8c16" size="18" />
            <span class="reservation-title">该书已有预约</span>
            <van-tag type="warning" v-if="book.reservation.status === 'pending'">待你确认地点</van-tag>
            <van-tag type="primary" v-else-if="book.reservation.status === 'confirmed'">待交接</van-tag>
            <van-tag type="success" v-else>已完成</van-tag>
          </div>
          <van-cell title="买家" :value="reservationBuyerName" />
          <van-cell title="期望取书时段" :value="book.reservation.pickupSlot" />
          <van-cell
            v-if="book.reservation.status !== 'pending'"
            title="碰面地点"
            :value="book.reservation.meetingLocation || '未设置'"
          />
          <div class="reservation-actions" v-if="book.reservation.status !== 'completed'">
            <van-button type="primary" size="small" @click="goMyReservations">
              {{ book.reservation.status === 'pending' ? '去确认碰面地点' : '去校验取书码' }}
            </van-button>
          </div>
        </template>
      </div>

      <!-- 其他买家看到已预约/已售出时的提示 -->
      <van-notice-bar
        v-if="!isOwner && !isReservationBuyer && book.status !== 'available'"
        :text="book.status === 'sold' ? '该书已售出，可以看看其他书籍' : '该书已被预约，暂时无法下单'"
      />

      <div class="bottom-placeholder" />

      <div class="bottom-actions">
        <van-button icon="star-o" :type="isFavorite ? 'warning' : 'default'" @click="toggleFavorite">
          {{ isFavorite ? '已收藏' : '收藏' }}
        </van-button>
        <van-button plain type="primary" :disabled="isOwner" @click="contactSeller">
          联系卖家
        </van-button>
        <van-button
          v-if="book.status === 'available' && !isOwner"
          type="primary"
          block
          @click="openSlotPicker"
        >
          立即预约
        </van-button>
        <van-button v-else-if="isReservationBuyer && book.status === 'reserved'" type="primary" block @click="goMyReservations('buyer')">
          查看我的预约
        </van-button>
        <van-button v-else type="primary" block disabled>
          {{ isOwner ? '这是我发布的' : book.status === 'sold' ? '已售出' : '已预约' }}
        </van-button>
      </div>
    </div>

    <van-empty v-else description="书籍不存在" />

    <!-- 取书时段选择 -->
    <van-popup v-model:show="showSlotPicker" position="bottom" round>
      <van-picker
        title="选择取书时段"
        :columns="slotOptions"
        :columns-field-names="{ text: 'text', value: 'value' }"
        @confirm="onSlotConfirm"
        @cancel="showSlotPicker = false"
      />
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
import { conditionMap, categoryMap, tradeMethodMap } from '@/types';
import { getPickupSlotOptions } from '@/utils/pickupSlots';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const book = ref<Awaited<ReturnType<typeof getBookById>> | null>(null);
const isFavorite = ref(false);
const showSlotPicker = ref(false);
const submitting = ref(false);

const slotOptions = getPickupSlotOptions();

const isOwner = computed(() => book.value?.sellerId === authStore.user?.id);
const isReservationBuyer = computed(
  () => !!book.value?.reservation && book.value.reservation.buyerId === authStore.user?.id
);
const reservationBuyerName = computed(() => book.value?.reservation?.buyer?.name || '未设置昵称');

const fetchBook = async () => {
  loading.value = true;
  try {
    book.value = await getBookById(route.params.id as string);
  } finally {
    loading.value = false;
  }
};

const requireLogin = () => {
  if (!authStore.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath } });
    return false;
  }
  return true;
};

const toggleFavorite = async () => {
  if (!requireLogin()) return;
  try {
    const result = await apiToggleFavorite(book.value!.id);
    isFavorite.value = result.isFavorite;
    showToast(result.isFavorite ? '收藏成功' : '已取消收藏');
  } catch {}
};

const contactSeller = () => {
  if (!requireLogin()) return;
  if (!book.value?.seller) return;
  router.push(`/chat/${book.value.seller.id}?bookId=${book.value.id}`);
};

const openSlotPicker = () => {
  if (!requireLogin()) return;
  showSlotPicker.value = true;
};

const onSlotConfirm = async ({ selectedOptions }: { selectedOptions: Array<{ value: string }> }) => {
  const slot = selectedOptions[0]?.value;
  if (!slot || submitting.value) return;
  submitting.value = true;
  try {
    await createReservation(book.value!.id, slot);
    showToast('预约成功，等待卖家确认地点');
    showSlotPicker.value = false;
    await fetchBook();
  } catch {
    // 失败提示已由请求拦截器统一弹出
  } finally {
    submitting.value = false;
  }
};

const onCancelReservation = async (reservationId: string) => {
  try {
    await showConfirmDialog({
      title: '取消预约',
      message: '取消后该书将恢复可购买，确定取消吗？',
    });
    await apiCancelReservation(reservationId);
    showToast('已取消预约');
    await fetchBook();
  } catch {}
};

const goMyReservations = (tab = 'seller') => {
  if (!requireLogin()) return;
  router.push({ path: '/my-reservations', query: { tab } });
};

const viewReviews = () => {
  if (!book.value?.seller) return;
  showToast('请在个人中心查看卖家评价');
};

onMounted(async () => {
  // 刷新进入时 token 存在但 user 尚未拉取，先补全身份再加载详情中的预约视图
  if (authStore.isAuthenticated && !authStore.user) {
    await authStore.fetchCurrentUser();
  }
  await fetchBook();
});
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.detail-body {
  padding-bottom: 16px;
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
.reservation-card {
  margin: 0 12px 12px;
  border-radius: 8px;
  overflow: hidden;
  background: white;
  border: 1px solid #e8f0fe;
}
.reservation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f5f9ff;
}
.reservation-title {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  color: #1a1a1a;
}
.code-area {
  padding: 16px;
  text-align: center;
}
.code-label {
  font-size: 12px;
  color: #999;
}
.code-value {
  margin-top: 8px;
  font-size: 34px;
  font-weight: bold;
  letter-spacing: 10px;
  text-indent: 10px;
  color: #1989fa;
}
.code-pending {
  padding: 12px 16px;
  font-size: 13px;
  color: #999;
}
.reservation-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 16px 12px;
}
.bottom-placeholder {
  height: 80px;
}
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: white;
  display: flex;
  gap: 8px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}
</style>
