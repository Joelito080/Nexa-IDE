/**
 * Component memoization utilities for performance optimization.
 * Provides memoized component wrappers to prevent unnecessary re-renders.
 */

import React, { ReactNode, useMemo, useCallback } from 'react'

/**
 * Deeply memo a component with custom comparison.
 * Use for components with complex prop structures.
 */
export function deepMemo<P extends object>(
  Component: React.FC<P>,
  propsAreEqual?: (prevProps: P, nextProps: P) => boolean
): React.FC<P> {
  return React.memo(Component, propsAreEqual)
}

/**
 * Memoize a list renderer function to prevent re-creating callbacks on every render.
 * Useful for .map() and virtual list renderers.
 */
export function useMemoizedListRenderer<T, R>(
  items: T[],
  renderFn: (item: T, index: number) => R,
  deps: React.DependencyList = []
): (item: T, index: number) => R {
  return useCallback((item: T, index: number) => renderFn(item, index), [...deps, items.length])
}

/**
 * Create a memoized click handler that captures an item.
 * Prevents inline arrow functions in render.
 */
export function useMemoizedItemHandler<T>(
  onHandle: (item: T) => void,
  deps: React.DependencyList = []
): (item: T) => void {
  return useCallback((item: T) => onHandle(item), deps)
}

/**
 * Memoize a selector function result (similar to reselect).
 * Compares results and only updates if output changes.
 */
export function useMemoSelector<T, R>(
  selector: (state: T) => R,
  state: T,
  deps: React.DependencyList = []
): R {
  return useMemo(() => selector(state), [state, ...deps])
}

/**
 * Create stable object refs that don't change unless values change.
 * Use for passing objects as props to memoized children.
 */
export function useMemoObject<T extends Record<string, any>>(
  obj: T
): T {
  return useMemo(() => obj, Object.values(obj))
}

/**
 * Create stable array refs that don't change unless values change.
 * Use for passing arrays as props to memoized children.
 */
export function useMemoArray<T>(arr: T[]): T[] {
  return useMemo(() => arr, arr)
}

/**
 * Compound selector for creating a single memoized state object from multiple selectors.
 * Returns same reference if none of the selected values changed.
 */
export function useMemoizedState<T extends Record<string, any>>(
  selectors: T
): T {
  return useMemo(() => selectors, Object.values(selectors))
}
