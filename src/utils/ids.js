let counter = 0;

export function createId(prefix = 'id') {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function createTestIdFactory() {
  let testCounter = 0;
  return (prefix = 'id') => {
    testCounter += 1;
    return `${prefix}-${testCounter}`;
  };
}
