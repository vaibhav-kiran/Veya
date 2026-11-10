/**
 * RFC 4122 v4-style id for local records (ideas, tasks, messages). These ids
 * only need to be unique on this device, not cryptographically secure, so a
 * pure-JS generator avoids depending on a native module.
 */
export function createId(): string {
  const hex = "0123456789abcdef";
  let id = "";
  for (let index = 0; index < 36; index += 1) {
    if (index === 8 || index === 13 || index === 18 || index === 23) id += "-";
    else if (index === 14) id += "4";
    else if (index === 19) id += hex[(Math.random() * 4) | 8];
    else id += hex[(Math.random() * 16) | 0];
  }
  return `${id}-${Date.now().toString(36)}`;
}
