export function getManagedDocReservedRootTitles(config) {
  const children = config?.projectStarter?.children;
  if (Array.isArray(children) && children.length > 0) {
    return children.map((child) => child.title);
  }

  return ["Ops", "Planning", "Access", "Vendors", "Runbooks", "Incidents"];
}
