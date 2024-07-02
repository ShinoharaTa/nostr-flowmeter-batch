const currUnixtime = (): number => Math.floor(new Date().getTime() / 1000);

const appendWithLimit = (
  array: [],
  value: number | string | null,
  maxLength: number,
) => {
  const newArray = [...array, value];
  if (newArray.length > maxLength) {
    return newArray.slice(-maxLength);
  }
  return newArray;
};

export { currUnixtime, appendWithLimit };
