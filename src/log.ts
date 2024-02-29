import { format } from "date-fns";

export const logger = (type: string, object: unknown) => {
  const now = format(new Date(), "yyyy/MM/dd HH:mm:ss");
  console.log(`[${now}] ${type}: `, object);
};
