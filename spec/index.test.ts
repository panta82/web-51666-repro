import { add } from '../src/index';

describe('add', () => {
  it('can add numbers', () => {
    expect(add(4, 6)).toEqual(10);
  });
});
