export interface NotificationPayload {
  productId: number;
  productName: string;
  oldPrice: number | null;
  newPrice: number;
  retailerName: string;
  changeType: 'drop' | 'increase' | 'new';
  changePercent?: number;
  productUrl?: string;
}

export interface NotificationChannel {
  type: string;
  send(webhookUrl: string, payload: NotificationPayload): Promise<boolean>;
}
