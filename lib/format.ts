const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** 6 → "six" (falls back to digits past twelve). Keeps prose counts in step with the data they describe. */
export const countWord = (n: number) => WORDS[n] ?? String(n);

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
