export function isValidHostname(host: string) {
  return (
    host.length <= 253 &&
    !host.includes("://") &&
    !host.includes("/") &&
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      host,
    )
  );
}

export function isValidPort(port: number) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}
