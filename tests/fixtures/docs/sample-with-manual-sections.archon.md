# calculateTotal

<!-- archon:generated -->
<!-- source-arn: arn:archon:code:workspace/package/src/utils.ts#calculateTotal -->
<!-- index-hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 -->

## Purpose

This function is defined in `src/utils.ts` at line 10.

## Description

Calculates the total price of all items in a cart.

## Signature

```
function calculateTotal(items: Item[]): number
```

<!-- archon:manual -->
## Implementation Notes

This function uses a reduce operation for efficiency.
Consider caching results for large arrays.

## Known Issues

- Does not handle negative prices
- May overflow for very large totals
<!-- /archon:manual -->

**Source**
- `src/utils.ts`
