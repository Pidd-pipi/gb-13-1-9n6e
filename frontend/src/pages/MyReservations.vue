<template>
  <div class="page-container">
    <van-nav-bar title="我的预约" left-arrow @click-left="router.back" />

    <van-tabs v-model:active="activeTab" @change="onTabChange" sticky>
      <!-- 我是买家 -->
      <van-tab title="我买到的">
        <van-loading v-if="loading" class="loading-center" />
        <template v-else>
          <div v-if="asBuyer.length > 0" class="reservation-list">
            <div v-for="item in asBuyer" :key="item.id" class="reservation-card">
              <div class="card-top" @click="goBook(item.bookId)">
                <van-image
                  v-if="item.book?.images?.[0]"
                  :src="item.book.images[0]"
                  width="64"
                  height="64"
                  fit="cover"
                  radius="6"
                />
                <div class="card-book">
                  <div class="book-title">{{ item.book?.title || '书籍信息' }}</div>
                  <div class="book-price">¥{{ item.book?.price ?? '-' }}</div>
                  <van-tag :type="tagType(item.status)">{{ reservationStatusMap[item.status] }}</van-tag>
                </div>
              </div>

              <van-cell title="取书时段" :value="item.pickupSlot" />
              <van-cell title="碰面地点" :value="item.meetingLocation || '卖家尚未确认'" />

              <div v-if="item.status === 'confirmed'" class="code-area">
                <div class="code-label">六位取书码 · 到店向卖家报码</div>
                <div class="code-value">{{ item.pickupCode }}</div>
              </div>
              <div v-else-if="item.status === 'pending'" class="code-tip">
                卖家确认碰面地点后，这里会显示六位取书码
              </div>

              <div class="card-actions" v-if="item.status !== 'completed'">
                <van-button plain type="danger" size="small" @click="onCancel(item.id)">取消预约</van-button>
              </div>
              <div class="card-actions completed-tip" v-else>
                <van-icon name="passed" color="#07c160" /> 交接已完成
              </div>
            </div>
          </div>
          <van-empty v-else description="暂无作为买家的预约" />
        </template>
      </van-tab>

      <!-- 我是卖家 -->
      <van-tab title="我卖出的">
        <van-loading v-if="loading" class="loading-center" />
        <template v-else>
          <div v-if="asSeller.length > 0" class="reservation-list">
            <div v-for="item in asSeller" :key="item.id" class="reservation-card">
              <div class="card-top" @click="goBook(item.bookId)">
                <van-image
                  v-if="item.book?.images?.[0]"
                  :src="item.book.images[0]"
                  width="64"
                  height="64"
                  fit="cover"
                  radius="6"
                />
                <div class="card-book">
                  <div class="book-title">{{ item.book?.title || '书籍信息' }}</div>
                  <div class="book-price">¥{{ item.book?.price ?? '-' }}</div>
                  <van-tag :type="tagType(item.status)">{{ reservationStatusMap[item.status] }}</van-tag>
                </div>
              </div>

              <van-cell title="买家" :value="item.buyer?.name || '未设置昵称'" />
              <van-cell title="期望取书时段" :value="item.pickupSlot" />
              <van-cell title="碰面地点" :value="item.meetingLocation || '尚未确认'" />

              <!-- 待确认：联系方式与取书码都不可见 -->
              <div v-if="item.status === 'pending'" class="seller-tip">
                确认碰面地点后，买家将看到取书码，你也能看到买家联系方式
              </div>

              <!-- 已确认：卖家可看到联系方式，但看不到取书码 -->
              <div v-else-if="item.status === 'confirmed'" class="contact-area">
                <div class="contact-label">买家联系方式</div>
                <div class="contact-value">
                  {{ item.buyer?.contactInfo || '买家未填写联系方式，可通过站内消息联系' }}
                </div>
              </div>

              <div class="card-actions" v-if="item.status !== 'completed'">
                <van-button plain type="danger" size="small" @click="onCancel(item.id)">取消预约</van-button>
                <van-button plain type="primary" size="small" @click="openContact(item)">联系买家</van-button>
                <van-button plain type="primary" size="small" @click="openLocationPopup(item)">
                  {{ item.status === 'pending' ? '确认碰面地点' : '修改碰面地点' }}
                </van-button>
                <van-button
                  type="primary"
                  size="small"
                  :disabled="item.status !== 'confirmed'"
                  @click="openVerifyPopup(item)"
                >
                  校验取书码
                </van-button>
              </div>
              <div class="card-actions completed-tip" v-else>
                <van-icon name="passed" color="#07c160" /> 已完成售出
              </div>
            </div>
          </div>
          <van-empty v-else description="暂无作为卖家的预约" />
        </template>
      </van-tab>
    </van-tabs>

    <!-- 卖家确认/修改碰面地点 -->
    <van-dialog
      v-model:show="showLocationPopup"
      title="确认碰面地点"
      show-cancel-button
      :before-close="onLocationSubmit"
    >
      <van-field
        v-model="locationText"
        rows="2"
        autosize
        type="textarea"
        placeholder="请输入碰面地点，如：东区图书馆一楼大厅"
        maxlength="100"
        show-word-limit
      />
    </van-dialog>

    <!-- 卖家校验取书码 -->
    <van-dialog
      v-model:show="showVerifyPopup"
      title="校验取书码"
      show-cancel-button
      :before-close="onVerifySubmit"
    >
      <van-field
        v-model="verifyCode"
        type="digit"
        maxlength="6"
        center
        placeholder="请输入买家报出的6位数字"
      />
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import {
  getMyReservations,
  confirmLocation,
  cancelReservation,
  verifyPickupCode,
} from '@/api/reservation';
import type { Reservation, ReservationStatus } from '@/types';
import { reservationStatusMap } from '@/types';

type DialogAction = 'confirm' | 'cancel';

const router = useRouter();
const route = useRoute();

const activeTab = ref(route.query.tab === 'buyer' ? 0 : 1);
const loading = ref(true);
const asBuyer = ref<Reservation[]>([]);
const asSeller = ref<Reservation[]>([]);

const showLocationPopup = ref(false);
const locationText = ref('');
const currentReservation = ref<Reservation | null>(null);
const submitting = ref(false);

const showVerifyPopup = ref(false);
const verifyCode = ref('');

const fetchReservations = async () => {
  loading.value = true;
  try {
    const result = await getMyReservations();
    asBuyer.value = result.asBuyer;
    asSeller.value = result.asSeller;
  } finally {
    loading.value = false;
  }
};

const onTabChange = (index: number) => {
  router.replace({ query: { tab: index === 0 ? 'buyer' : 'seller' } });
};

const tagType = (status: ReservationStatus) => {
  if (status === 'pending') return 'warning';
  if (status === 'confirmed') return 'primary';
  return 'success';
};

const goBook = (bookId: string) => {
  router.push(`/book/${bookId}`);
};

const onCancel = async (id: string) => {
  try {
    await showConfirmDialog({
      title: '取消预约',
      message: '取消后书籍将恢复可购买，确定取消吗？',
    });
    await cancelReservation(id);
    showToast('已取消预约');
    fetchReservations();
  } catch {}
};

const openContact = (item: Reservation) => {
  router.push(`/chat/${item.buyerId}`);
};

const openLocationPopup = (item: Reservation) => {
  currentReservation.value = item;
  locationText.value = item.meetingLocation || '';
  showLocationPopup.value = true;
};

const onLocationSubmit = async (action: DialogAction) => {
  if (action !== 'confirm' || !currentReservation.value) return true;
  const location = locationText.value.trim();
  if (!location) {
    showToast('请填写碰面地点');
    return false;
  }
  if (submitting.value) return false;
  submitting.value = true;
  try {
    await confirmLocation(currentReservation.value.id, location);
    showToast('碰面地点已确认');
    await fetchReservations();
    return true;
  } catch {
    return false;
  } finally {
    submitting.value = false;
  }
};

const openVerifyPopup = (item: Reservation) => {
  currentReservation.value = item;
  verifyCode.value = '';
  showVerifyPopup.value = true;
};

const onVerifySubmit = async (action: DialogAction) => {
  if (action !== 'confirm' || !currentReservation.value) return true;
  if (!/^\d{6}$/.test(verifyCode.value.trim())) {
    showToast('请输入6位数字取书码');
    return false;
  }
  if (submitting.value) return false;
  submitting.value = true;
  try {
    await verifyPickupCode(currentReservation.value.id, verifyCode.value.trim());
    showToast('校验成功，已标记售出');
    await fetchReservations();
    return true;
  } catch {
    // 取书码错误等失败提示由拦截器弹出，预约和书籍均保持原状，弹窗保留方便重试
    return false;
  } finally {
    submitting.value = false;
  }
};

onMounted(fetchReservations);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.reservation-list {
  padding: 12px;
}
.reservation-card {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}
.card-top {
  display: flex;
  gap: 12px;
  padding: 12px;
}
.card-book {
  flex: 1;
}
.book-title {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.book-price {
  font-size: 16px;
  font-weight: bold;
  color: #ff4d4f;
  margin: 4px 0;
}
.code-area {
  padding: 16px;
  text-align: center;
  background: #f5f9ff;
  margin: 0 12px;
  border-radius: 6px;
}
.code-label {
  font-size: 12px;
  color: #999;
}
.code-value {
  margin-top: 6px;
  font-size: 32px;
  font-weight: bold;
  letter-spacing: 10px;
  text-indent: 10px;
  color: #1989fa;
}
.code-tip,
.seller-tip {
  margin: 0 12px 12px;
  padding: 10px 12px;
  font-size: 12px;
  color: #999;
  background: #f7f8fa;
  border-radius: 6px;
}
.contact-area {
  margin: 0 12px 12px;
  padding: 10px 12px;
  background: #f0faf0;
  border-radius: 6px;
}
.contact-label {
  font-size: 12px;
  color: #07c160;
}
.contact-value {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 500;
  color: #1a1a1a;
}
.card-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}
.completed-tip {
  justify-content: center;
  align-items: center;
  gap: 4px;
  color: #07c160;
  font-size: 13px;
}
</style>
