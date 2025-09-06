/**
 * Helper function to check if a key is a valid array index
 */
function isValidArrayIndex(key: string): boolean {
  const index = Number.parseInt(key, 10)
  return !Number.isNaN(index) && index >= 0 && index.toString() === key
}

/**
 * Helper function to get the value at a key, handling both object properties and array indices
 */
function getValueAtKey(obj: Record<string, unknown>, key: string): unknown {
  if (isValidArrayIndex(key) && Array.isArray(obj)) {
    return obj[Number.parseInt(key, 10)]
  }
  return obj[key]
}

/**
 * Helper function to set the value at a key, handling both object properties and array indices
 */
function setValueAtKey(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (isValidArrayIndex(key) && Array.isArray(obj)) {
    obj[Number.parseInt(key, 10)] = value
  } else {
    obj[key] = value
  }
}

/**
 * Helper function to check if a key exists, handling both object properties and array indices
 */
function hasKey(obj: Record<string, unknown>, key: string): boolean {
  if (isValidArrayIndex(key) && Array.isArray(obj)) {
    const index = Number.parseInt(key, 10)
    return index >= 0 && index < obj.length
  }
  return key in obj
}

/**
 * Helper function to delete a key, handling both object properties and array indices
 */
function deleteKey(obj: Record<string, unknown>, key: string): boolean {
  if (isValidArrayIndex(key) && Array.isArray(obj)) {
    const index = Number.parseInt(key, 10)
    if (index >= 0 && index < obj.length) {
      obj.splice(index, 1)
      return true
    }
    return false
  }
  if (key in obj) {
    delete obj[key]
    return true
  }
  return false
}

/**
 * Deletes a property from an object using dot notation path
 * @param obj - The object to delete the property from
 * @param path - The dot notation path to the property (e.g., "user.profile.name", "items.0.name")
 * @returns true if the property was deleted, false if it didn't exist
 *
 * @example
 * ```typescript
 * const obj = { user: { profile: { name: "John", age: 30 } } }
 * deleteProperty(obj, "user.profile.name") // returns true, obj.user.profile.age remains
 * deleteProperty(obj, "user.profile") // returns true, obj.user becomes {}
 * deleteProperty(obj, "nonexistent.path") // returns false
 *
 * const arr = { items: [{ name: "item1" }, { name: "item2" }] }
 * deleteProperty(arr, "items.0.name") // returns true, removes name from first item
 * deleteProperty(arr, "items.0") // returns true, removes first item from array
 * ```
 */
export function deleteProperty(
  obj: Record<string, unknown>,
  path: string,
): boolean {
  if (!obj || typeof obj !== "object" || !path) {
    return false
  }

  const keys = path.split(".")
  const lastKey = keys.pop()

  if (!lastKey) {
    return false
  }

  // Navigate to the parent object
  let current = obj
  for (const key of keys) {
    const value = getValueAtKey(current, key)
    if (value === null || typeof value !== "object") {
      return false
    }
    current = value as Record<string, unknown>
  }

  // Delete the property
  return deleteKey(current, lastKey)
}

/**
 * Gets a property from an object using dot notation path
 * @param obj - The object to get the property from
 * @param path - The dot notation path to the property
 * @returns The value at the path, or undefined if not found
 *
 * @example
 * ```typescript
 * const obj = { user: { profile: { name: "John" } } }
 * getProperty(obj, "user.profile.name") // returns "John"
 * getProperty(obj, "user.profile.age") // returns undefined
 *
 * const arr = { items: [{ name: "item1" }, { name: "item2" }] }
 * getProperty(arr, "items.0.name") // returns "item1"
 * getProperty(arr, "items.1.name") // returns "item2"
 * ```
 */
export function getProperty(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  if (!obj || typeof obj !== "object" || !path) {
    return
  }

  const keys = path.split(".")
  let current = obj

  for (const key of keys) {
    const value = getValueAtKey(current, key)
    if (value === null || typeof value !== "object") {
      return value
    }
    current = value as Record<string, unknown>
  }

  return current
}

/**
 * Sets a property on an object using dot notation path
 * @param obj - The object to set the property on
 * @param path - The dot notation path to the property
 * @param value - The value to set
 * @returns true if the property was set successfully, false otherwise
 *
 * @example
 * ```typescript
 * const obj = { user: { profile: {} } }
 * setProperty(obj, "user.profile.name", "John") // returns true
 * setProperty(obj, "user.profile.age", 30) // returns true
 *
 * const arr = { items: [] }
 * setProperty(arr, "items.0", { name: "item1" }) // returns true
 * setProperty(arr, "items.0.name", "updated") // returns true
 * ```
 */
export function setProperty(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): boolean {
  if (!obj || typeof obj !== "object" || !path) {
    return false
  }

  const keys = path.split(".")
  const lastKey = keys.pop()

  if (!lastKey) {
    return false
  }

  // Navigate to the parent object, creating intermediate objects/arrays if needed
  let current = obj
  for (const key of keys) {
    let currentValue = getValueAtKey(current, key)
    if (currentValue === null || typeof currentValue !== "object") {
      // Create appropriate type based on the key
      currentValue = isValidArrayIndex(key) ? [] : {}
      setValueAtKey(current, key, currentValue)
    }
    current = currentValue as Record<string, unknown>
  }

  // Set the property
  setValueAtKey(current, lastKey, value)
  return true
}

/**
 * Checks if a property exists in an object using dot notation path
 * @param obj - The object to check
 * @param path - The dot notation path to the property
 * @returns true if the property exists, false otherwise
 *
 * @example
 * ```typescript
 * const obj = { user: { profile: { name: "John" } } }
 * hasProperty(obj, "user.profile.name") // returns true
 * hasProperty(obj, "user.profile.age") // returns false
 *
 * const arr = { items: [{ name: "item1" }] }
 * hasProperty(arr, "items.0.name") // returns true
 * hasProperty(arr, "items.1") // returns false
 * ```
 */
export function hasProperty(
  obj: Record<string, unknown>,
  path: string,
): boolean {
  if (!obj || typeof obj !== "object" || !path) {
    return false
  }

  const keys = path.split(".")
  let current = obj

  for (const key of keys) {
    const value = getValueAtKey(current, key)
    if (value === null || typeof value !== "object") {
      return hasKey(current, key)
    }
    current = value as Record<string, unknown>
  }

  return true
}
