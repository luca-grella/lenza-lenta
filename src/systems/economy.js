// Economy: coins in save.state.coins. Emits 'coins:change' {coins, delta, reason}.

export function createEconomy(ctx, env) {
  const S = env.S;
  const stats = () => (S().stats ||= {});

  const economy = {
    get coins() { return S().coins | 0; },
    canAfford(n) { return (S().coins | 0) >= n; },
    /** Add coins (n > 0). Returns the new balance. */
    earn(n, reason = '') {
      n = Math.round(+n || 0);
      if (n <= 0) return economy.coins;
      S().coins = (S().coins | 0) + n;
      stats().coinsEarned = (stats().coinsEarned | 0) + n;
      ctx.save.commit();
      ctx.bus.emit('coins:change', { coins: S().coins, delta: n, reason });
      return S().coins;
    },
    /** Spend coins if affordable. Returns true on success. */
    spend(n, reason = '') {
      n = Math.round(+n || 0);
      if (n < 0) return false;
      if (n === 0) return true;
      if (!economy.canAfford(n)) return false;
      S().coins -= n;
      stats().coinsSpent = (stats().coinsSpent | 0) + n;
      ctx.save.commit();
      ctx.bus.emit('coins:change', { coins: S().coins, delta: -n, reason });
      return true;
    },
  };
  return economy;
}
