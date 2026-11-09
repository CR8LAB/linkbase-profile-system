export function shouldRecordLocationVisit(previousLocationKey, locationKey) {
  return Boolean(locationKey) && previousLocationKey !== locationKey;
}
