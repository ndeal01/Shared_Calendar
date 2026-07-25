const request = require('supertest');

// Require the server module after we set up any mocks if needed
const serverModule = require('../server/example_server');
const app = serverModule.app;

describe('Validation and basic event CRUD behavior (mocked DB)', () => {
  let mockClient;

  beforeEach(() => {
    // Create a mock client that simulates pg client behavior
    mockClient = {
      query: jest.fn(async (sql, params) => {
        const s = (sql || '').toString();
        if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
        if (s.startsWith("SELECT set_config")) return { rows: [] };
        if (s.startsWith('SELECT id FROM members')) return { rowCount: 1, rows: [{ id: '33333333-3333-3333-3333-333333333333' }] };
        if (s.startsWith('INSERT INTO events')) {
          // return an inserted row
          return { rowCount: 1, rows: [{ id: 'evt-1', family_id: params[0], title: params[1], description: params[2], location: params[3], start_time: params[4], end_time: params[5], all_day: params[6], created_by: params[7] }] };
        }
        if (s.startsWith('INSERT INTO event_members')) return { rowCount: 1 };
        if (s.startsWith('SELECT member_id FROM event_members')) return { rows: [{ member_id: '33333333-3333-3333-3333-333333333333' }] };
        if (s.startsWith('SELECT e.* FROM events')) return { rows: [] };
        if (s.startsWith('SELECT * FROM events WHERE id =')) return { rowCount: 1, rows: [{ id: params[0], title: 'Existing', family_id: '2222' }] };
        if (s.startsWith('DELETE FROM events')) return { rowCount: 1, rows: [{ id: params[0] }] };
        if (s.startsWith('UPDATE events')) return { rowCount: 1, rows: [{ id: params[params.length-1] }] };
        return { rows: [] };
      }),
      release: jest.fn()
    };

    // Replace pool.connect to return our mock client
    serverModule.pool.connect = jest.fn().mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('POST /events returns 400 when required fields missing', async () => {
    const res = await request(app).post('/events').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /families without user returns 401', async () => {
    const res = await request(app).post('/families').send({ name: 'New Family' });
    expect(res.status).toBe(401);
  });

  test('POST /events creates event when payload valid', async () => {
    const payload = {
      family_id: '22222222-2222-2222-2222-222222222222',
      title: 'Playdate',
      description: 'Park',
      start_time: '2026-08-01T15:00:00Z',
      end_time: '2026-08-01T16:00:00Z',
      assigned_member_ids: ['33333333-3333-3333-3333-333333333333']
    };

    const res = await request(app)
      .post('/events')
      .query({ as_user: '11111111-1111-1111-1111-111111111111' })
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.assigned_member_ids).toContain('33333333-3333-3333-3333-333333333333');

    // Ensure DB client was used and set_config was called
    expect(serverModule.pool.connect).toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalled();
  });
});
