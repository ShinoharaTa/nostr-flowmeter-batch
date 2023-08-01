export const currUnixtime = (): number =>
  Math.floor(new Date().getTime() / 1000);
