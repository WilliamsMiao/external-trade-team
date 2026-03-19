# Google Trends 数据收集

## Description
获取Google搜索趋势数据，分析关键词热度变化

## Triggers
- "搜索趋势" / "热度" / "trends"
- "关键词趋势" / "上升"
- "google trends"

## Action
调用Google Trends API获取趋势数据

## Parameters
```json
{
  "keywords": ["蓝牙耳机", "无线充电器"],
  "geo": "US",
  "timeframe": "today 3-m"
}
```

## Output
返回趋势分析，含：
- 关键词热度
- 趋势方向（上升/下降/稳定）
- 相关查询
