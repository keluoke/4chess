export const RATINGS = [600, 1000, 1400, 1800, 2200, 2600];
export const TREND_WIDTH = 420;
export const TREND_HEIGHT = 161;
export const trendX = rating => 36 + (rating - RATINGS[0]) / 2000 * 360;
export const trendY = percentage => 135 - percentage * 1.16;
export const TREND_TICKS = [0, 25, 50, 75, 100];
