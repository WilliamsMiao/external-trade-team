# Skill: 1688产品搜索

## Description
搜索1688/阿里巴巴批发平台产品，获取供应商和价格信息

## Triggers
- "搜索1688" / "找1688" / "1688"
- "查找供应商" / "找工厂"
- "alibaba product" / "1688 product"

## Action
调用1688 API搜索产品

## Parameters
```
{
  "keyword": "产品关键词",
  "category": "类目(可选)",
  "page": 1,
  "pageSize": 20
}
```

## Output
返回产品列表，含：
- 产品名称、价格
- 供应商信息
- 起订量
- 销量

## Example
```
User: 帮我搜索1688的蓝牙耳机
Agent: 调用 skill1688_search 搜索蓝牙耳机
```
