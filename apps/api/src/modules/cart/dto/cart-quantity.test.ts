import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AddToCartDto } from './add-to-cart.dto';
import { UpdateCartItemDto } from './update-cart-item.dto';

/**
 * Security regression tests for cart quantity bounds — quantity must stay in
 * [1, 99] so a hostile client cannot inflate a reservation (or the cart total)
 * to absurd magnitudes and DoS other buyers at checkout.
 */
describe('Cart quantity bounds', () => {
  describe('AddToCartDto', () => {
    function makeDto(quantity: number) {
      return plainToInstance(AddToCartDto, { productId: 'clx1', quantity });
    }

    it('accepts a quantity of 1', async () => {
      expect(await validate(makeDto(1))).toHaveLength(0);
    });

    it('accepts a quantity of 99 (the max)', async () => {
      expect(await validate(makeDto(99))).toHaveLength(0);
    });

    it('rejects a quantity of 100 (over the cap)', async () => {
      const errors = await validate(makeDto(100));
      expect(errors.some((e) => e.property === 'quantity')).toBe(true);
    });

    it('rejects a quantity of 0 (below the min)', async () => {
      const errors = await validate(makeDto(0));
      expect(errors.some((e) => e.property === 'quantity')).toBe(true);
    });

    it('rejects a fractional quantity', async () => {
      const errors = await validate(makeDto(2.5));
      expect(errors.some((e) => e.property === 'quantity')).toBe(true);
    });
  });

  describe('UpdateCartItemDto', () => {
    function makeDto(quantity: number) {
      return plainToInstance(UpdateCartItemDto, { quantity });
    }

    it('accepts an update to 99', async () => {
      expect(await validate(makeDto(99))).toHaveLength(0);
    });

    it('rejects an update to 100 (over the cap)', async () => {
      const errors = await validate(makeDto(100));
      expect(errors.some((e) => e.property === 'quantity')).toBe(true);
    });
  });
});