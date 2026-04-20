export const msg = {
  roomFull: (max) => ({ key: 'server.roomFull', params: { max } }),
  invalidImageId: () => ({ key: 'server.invalidImageId' }),
  itemLimitReached: (limit) => ({ key: 'server.itemLimitReached', params: { limit } }),
  templatePartialLoad: (loaded, total, limit) => ({
    key: 'server.templatePartialLoad',
    params: { loaded, total, limit },
  }),
};
