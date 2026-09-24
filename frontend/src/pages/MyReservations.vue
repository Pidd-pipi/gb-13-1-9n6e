<template>
  <div class="page-container">
    <van-nav-bar title="我的预约" left-arrow @click-left="router.back" />

    <van-tabs v-model:active="activeRole" @change="fetchReservations" sticky>
      <van-tab title="我买到的" name="buyer" />
      <van-tab title="我卖出的" name="seller" />
    </van-tabs>

    <van-loading v-if="loading" class="loading-center" />

    <div v-else-if="reservations.length > 0" class="reservation-list">
      <div v-for="r in reservations" :key="r.id" class="reservation-item">
        <div class="item-head" @click="goBook(r.bookId)">
          <van-image
            v-if="r.book?.images?.[0]"
            :src="r.book.images[0]"
            width="56"
            height="56"
            fit="cover"
            radius="6"
          />
          <div v-else class="book-placeholder">
            <van-icon name="book-o" size="24" />
          </div>
          <div class="item-book">
            <div class="book-title">{{ r.book?.title || '书籍信息' }}</div>
            <div class="book-price" v-if="r.book">¥{{ r.book.price }}</div>
          </div>
          <van-tag :type="tagType(r.status)">{{ reservationStatusMap[r.status] }}</van-tag>
        </div>

        <div class="item-rows">
          <div class="item-row"><span>取书时段</span><b>{{ r.pickupSlot }}</b></div>
          <div class="item-row">
            <span>碰面地点</span>
            <b v-if="r.meetLocation">{{ r.meetLocation }}</b>
            <i v-else>待确认</i>
          </div>

          <!-- 买家视角 -->
          <template v-if="activeRole === 'buyer'">
            <div class="item-row" v-if="r.seller">
              <span>卖家</span>
              <b>{{ r.seller.name || '匿名用户' }}</b>
            </div>
            <div v-if="r.status === 'awaiting_handover'" class="code-box">
              <span class="code-label">六位取书码（到店报给卖家）</span>
              <span class="code-value">{{ r.pickupCode }}</span>
            </div>
            <div v-if="r.status === 'awaiting_location'" class="code-tip">
              卖家确认碰面地点后将生成取书码
            </div>
            <div v-if="r.status === 'cancelled'" class="cancel-tip">
              预约已取消{{ r.cancelledBy === 'seller' ? '（卖家取消）' : '（你已取消）' }}，书籍恢复可购买
            </div>
          </template>

          <!-- 卖家视角：能看到买家联系方式，看不到取书码 -->
          <template v-else>
            <div class="item-row" v-if="r.buyer">
              <span>预约买家</span>
              <b>{{ r.buyer.name || r.buyer.studentId || '匿名用户' }}</b>
            </div>
            <div class="item-row">
              <span>买家联系方式</span>
              <b v-if="r.buyer?.contactInfo" class="contact">{{ r.buyer.contactInfo }}</b>
              <i v-else>买家未填写</i>
            </div>
            <div v-if="r.status === 'awaiting_handover'" class="code-tip">
              买家到店后，请让买家报取书码并在下方校验，取书码仅买家可见
            </div>
            <div v-if="r.status === 'cancelled'" class="cancel-tip">
              预约已取消{{ r.cancelledBy === 'buyer' ? '（买家取消）' : '（你已取消）' }}，书籍已恢复可购买
            </div>
          </template>
        </div>

        <div class="item-actions" v-if="r.status === 'awaiting_location' || r.status === 'awaiting_handover'">
          <!-- 卖家：待确认地点 -->
          <van-button
            v-if="activeRole === 'seller' && r.status === 'awaiting_location'"
            type="primary"
            size="small"
            @click="openLocationPopup(r)"
          >
            确认碰面地点
          </van-button>
          <!-- 卖家：校验取书码 -->
          <van-button
            v-if="activeRole === 'seller' && r.status === 'awaiting_handover'"
            type="success"
            size="small"
            @click="openVerifyPopup(r)"
          >
            校验取书码
          </van-button>
          <!-- 任一方取消 -->
          <van-button plain type="danger" size="small" @click="onCancel(r)">取消预约</van-button>
        </div>
      </div>
    </div>

    <van-empty v-else :description="activeRole === 'buyer' ? '还没有预约记录' : '还没有收到预约'" />

    <!-- 卖家确认碰面地点 -->
    <van-popup v-model:show="showLocationPopup" position="bottom" round>
      <div class="action-popup">
        <van-nav-bar title="确认碰面地点" :left-arrow="false" />
        <van-field
          v-model="locationText"
          rows="2"
          autosize
          type="textarea"
          maxlength="200"
          show-word-limit
          placeholder="例如：东区图书馆一楼服务台 / 第三食堂门口"
        />
        <div class="popup-tip">确认后买家将看到六位取书码，取书码对你不可见</div>
        <div class="popup-actions">
          <van-button type="primary" block round :loading="submitting" @click="submitLocation">确认</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 卖家输入取书码 -->
    <van-popup v-model:show="showVerifyPopup" position="bottom" round>
      <div class="action-popup">
        <van-nav-bar title="校验取书码" :left-arrow="false" />
        <van-field
          v-model="codeInput"
          type="digit"
          maxlength="6"
          center
          class="code-input"
          placeholder="请输入买家报出的6位数字"
        />
        <div class="popup-tip">校验通过后书籍将标记为已售出；输错不会改变预约和书籍状态</div>
        <div class="popup-actions">
          <van-button type="success" block round :loading="submitting" @click="submitVerify">校验并完成交接</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import {
  getMyReservations,
  confirmMeetLocation,
  cancelReservation,
  verifyPickupCode,
} from '@/api/reservation';
import type { Reservation, ReservationStatus } from '@/types';
import { reservationStatusMap } from '@/types';

const router = useRouter();
const route = useRoute();

const activeRole = ref<'buyer' | 'seller'>(route.query.role === 'seller' ? 'seller' : 'buyer');
const loading = ref(true);
const reservations = ref<Reservation[]>([]);

const showLocationPopup = ref(false);
const showVerifyPopup = ref(false);
const locationText = ref('');
const codeInput = ref('');
const submitting = ref(false);
const currentReservation = ref<Reservation | null>(null);

const tagType = (status: ReservationStatus) => {
  if (status === 'awaiting_location') return 'warning';
  if (status === 'awaiting_handover') return 'primary';
  if (status === 'completed') return 'success';
  return 'default';
};

const fetchReservations = async () => {
  loading.value = true;
  try {
    const data = await getMyReservations(activeRole.value);
    reservations.value = data.reservations;
  } catch {
    reservations.value = [];
  } finally {
    loading.value = false;
  }
};

const goBook = (bookId: string) => {
  router.push(`/book/${bookId}`);
};

const openLocationPopup = (r: Reservation) => {
  currentReservation.value = r;
  locationText.value = r.meetLocation || '';
  showLocationPopup.value = true;
};

const submitLocation = async () => {
  const text = locationText.value.trim();
  if (!text) {
    showToast('请填写碰面地点');
    return;
  }
  submitting.value = true;
  try {
    await confirmMeetLocation(currentReservation.value!.id, text);
    showToast('已确认，等待买家到店交接');
    showLocationPopup.value = false;
    await fetchReservations();
  } catch {
  } finally {
    submitting.value = false;
  }
};

const openVerifyPopup = (r: Reservation) => {
  currentReservation.value = r;
  codeInput.value = '';
  showVerifyPopup.value = true;
};

const submitVerify = async () => {
  if (!/^\d{6}$/.test(codeInput.value)) {
    showToast('请输入6位数字取书码');
    return;
  }
  submitting.value = true;
  try {
    await verifyPickupCode(currentReservation.value!.id, codeInput.value);
    showToast('取书码正确，交易已完成');
    showVerifyPopup.value = false;
    await fetchReservations();
  } catch {
    // 取书码错误等失败提示由请求拦截器统一展示，输入框保留以便重试
  } finally {
    submitting.value = false;
  }
};

const onCancel = async (r: Reservation) => {
  try {
    await showConfirmDialog({
      title: '确认取消预约',
      message: activeRole.value === 'seller'
        ? '取消后书籍将恢复可购买，确定取消该买家的预约吗？'
        : '取消后书籍将恢复可购买，确定取消预约吗？',
    });
  } catch {
    return;
  }
  try {
    await cancelReservation(r.id);
    showToast('预约已取消，书籍已恢复可购买');
    await fetchReservations();
  } catch {}
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
.reservation-item {
  background: white;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.item-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.book-placeholder {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  background: #f7f8fa;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dcdee0;
}
.item-book {
  flex: 1;
  min-width: 0;
}
.book-title {
  font-size: 14px;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.book-price {
  font-size: 15px;
  font-weight: bold;
  color: #ff4d4f;
  margin-top: 4px;
}
.item-rows {
  margin-top: 12px;
  border-top: 1px dashed #ebedf0;
  padding-top: 8px;
}
.item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #666;
  padding: 4px 0;
  gap: 12px;
}
.item-row b {
  color: #1a1a1a;
  font-weight: 500;
  text-align: right;
}
.item-row i {
  color: #999;
  font-style: normal;
}
.item-row .contact {
  color: #1989fa;
}
.code-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f0f9ff;
  border-radius: 6px;
  padding: 10px 12px;
  margin-top: 8px;
}
.code-label {
  font-size: 12px;
  color: #1989fa;
}
.code-value {
  font-size: 22px;
  font-weight: bold;
  letter-spacing: 4px;
  color: #1989fa;
  font-family: 'Courier New', monospace;
}
.code-tip {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}
.cancel-tip {
  font-size: 12px;
  color: #ee0a24;
  margin-top: 8px;
}
.item-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.action-popup {
  padding-bottom: 20px;
}
.popup-tip {
  font-size: 12px;
  color: #999;
  padding: 10px 16px 0;
}
.popup-actions {
  padding: 20px 16px 0;
}
.code-input :deep(input) {
  font-size: 24px;
  letter-spacing: 8px;
  text-align: center;
  font-weight: bold;
}
</style>
