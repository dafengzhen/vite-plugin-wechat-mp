import { formatTime } from '../../utils/util';

Page({
  data: { logs: [] as string[] },
  onLoad() {
    const logs: number[] = wx.getStorageSync('logs') || [];
    this.setData({ logs: logs.map((timestamp) => formatTime(new Date(timestamp))) });
  },
});
