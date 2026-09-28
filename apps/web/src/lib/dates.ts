const utcDateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export const formatUtcDateTime = (value: string) => utcDateTime.format(Date.parse(value));
