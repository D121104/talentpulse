import { createPostgresSslOptions } from 'src/database/postgres-ssl';

jest.mock('fs', () => ({
  readFileSync: jest
    .fn()
    .mockReturnValue('---BEGIN CERTIFICATE---\nca\n---END CERTIFICATE---'),
}));

describe('createPostgresSslOptions', () => {
  it('fails closed for staging and demo without an explicit CA file', () => {
    expect(() => createPostgresSslOptions({ NODE_ENV: 'staging' })).toThrow(
      'DB_SSL_CA_FILE is required',
    );
    expect(() => createPostgresSslOptions({ NODE_ENV: 'demo' })).toThrow(
      'DB_SSL_CA_FILE is required',
    );
  });

  it('keeps local development plaintext when TLS is not configured', () => {
    expect(createPostgresSslOptions({ NODE_ENV: 'development' })).toBe(false);
  });

  it('returns certificate-verifying TLS options for an explicit CA file', () => {
    expect(
      createPostgresSslOptions({
        NODE_ENV: 'staging',
        DB_SSL_CA_FILE: '/etc/ssl/certs/example-ca.pem',
      }),
    ).toEqual({ rejectUnauthorized: true, ca: expect.any(String) });
  });
});
