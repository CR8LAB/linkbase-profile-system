export function verifyPostgresClientTls(client) {
  const sslConfig = client?.connectionParameters?.ssl;
  const socket = client?.connection?.stream;

  if (!sslConfig || socket?.encrypted !== true) {
    throw new Error("PostgreSQL client connection is not encrypted");
  }

  const certificateVerificationEnabled =
    sslConfig !== false && sslConfig?.rejectUnauthorized !== false;
  if (certificateVerificationEnabled && socket.authorized !== true) {
    throw new Error("PostgreSQL server certificate was not authorized");
  }

  return {
    encrypted: true,
    certificateVerificationEnabled,
    certificateAuthorized: socket.authorized === true,
  };
}
