# Flow Manager

SME-focused flow management software.

## v0.1

Initial target: Dutch Maid stock visibility, PTA and DBR using standard Sage 50 exports.

### Current Sage 50 mappings

Product Details:
- AccountReference → StockCode
- Description → Description
- QuantityInStock → Quantity
- QuantityReOrderLevel → TargetLevel
- CategoryName → StockGroup
- InactiveFlag = 1 → exclude from active stock view

All active products are imported; Stock Group is a display/management filter.

Purchase Orders will be mapped from the standard Sage 50 open/part-delivered purchase order export.
