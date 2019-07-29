const expect = require('expect');
const app = require('../../server');
const { getToken } = require('./seed/authentificationSeed');
const {
  populateEvents,
  populateBills,
  populatePayment,
  populatePay,
  populateFinalPay,
} = require('./seed/exportSeed');

describe('NODE ENV', () => {
  it("should be 'test'", () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('EXPORTS ROUTES', () => {
  let authToken = null;

  describe('GET /exports/working_event/history', () => {
    beforeEach(populateEvents);
    beforeEach(async () => {
      authToken = await getToken('coach');
    });
    it('should get working events', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/working_event/history?startDate=2019-01-15T15%3A47%3A42.077%2B01%3A00&endDate=2019-01-17T15%3A47%3A42.077%2B01%3A00',
        headers: { 'x-access-token': authToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.result).toBeDefined();
      expect(response.result.split('\r\n').length).toBe(4);
    });
  });

  describe('GET /exports/bill/history', () => {
    beforeEach(populateBills);
    beforeEach(async () => {
      authToken = await getToken('coach');
    });
    it('should get bills', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/bill/history?startDate=2019-05-26T15%3A47%3A42.077%2B01%3A00&endDate=2019-05-29T15%3A47%3A42.077%2B01%3A00',
        headers: { 'x-access-token': authToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.result).toBeDefined();
      expect(response.result.split('\r\n').length).toBe(3);
    });
  });

  describe('GET /exports/payment/history', () => {
    beforeEach(populatePayment);
    beforeEach(async () => {
      authToken = await getToken('coach');
    });
    it('should get payments', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/payment/history?startDate=2019-05-25T16%3A47%3A49.168%2B02%3A00&endDate=2019-05-31T16%3A47%3A49.169%2B02%3A00',
        headers: { 'x-access-token': authToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.result).toBeDefined();
      expect(response.result.split('\r\n').length).toBe(3);
    });
  });

  describe('GET /exports/pay/history', () => {
    beforeEach(populatePay);
    beforeEach(async () => {
      authToken = await getToken('coach');
    });
    it('should get pay', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/pay/history?startDate=2019-01-01T15%3A47%3A42.077%2B01%3A00&endDate=2019-05-31T15%3A47%3A42.077%2B01%3A00',
        headers: { 'x-access-token': authToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.result).toBeDefined();
      expect(response.result.split('\r\n').length).toBe(2);
    });
  });

  describe('GET /exports/finalPay/history', () => {
    beforeEach(populateFinalPay);
    beforeEach(async () => {
      authToken = await getToken('coach');
    });
    it('should get payments', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/finalpay/history?startDate=2019-05-01T15%3A47%3A42.077%2B01%3A00&endDate=2019-05-31T15%3A47%3A42.077%2B01%3A00',
        headers: { 'x-access-token': authToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.result).toBeDefined();
      expect(response.result.split('\r\n').length).toBe(2);
    });
  });
});
