export interface PickupSlotOption {
  /** 提交给后端的时段文本，如 2026-09-24 上午 */
  value: string;
  /** 页面展示文本，如 9月24日(周三) 上午 */
  text: string;
}

const PERIODS = [
  { value: '上午', startHour: 9 },
  { value: '下午', startHour: 14 },
  { value: '晚上', startHour: 18 },
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

const weekdayText = (date: Date) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];

/**
 * 生成未来 7 天内可选的取书时段（每天上午/下午/晚上），
 * 今天已开始的时段自动过滤。
 */
export const getPickupSlotOptions = (): PickupSlotOption[] => {
  const now = new Date();
  const options: PickupSlotOption[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const isoDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const dateText = `${date.getMonth() + 1}月${date.getDate()}日(${weekdayText(date)})`;

    for (const period of PERIODS) {
      if (dayOffset === 0 && now.getHours() >= period.startHour) {
        continue;
      }
      options.push({
        value: `${isoDate} ${period.value}`,
        text: `${dateText} ${period.value}`,
      });
    }
  }

  return options;
};
