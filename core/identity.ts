/**
 * WireLang Core - identity helpers for reverse DB reconstruction
 */

import { Component } from './Component';
import { Node } from './Node';
import { Pin } from './Pin';

export interface ComponentIdentity {
  id?: string;
  label?: string;
  pinIds?: Record<string, string>;
}

export function applyComponentIdentity(component: Component, identity: ComponentIdentity): void {
  if (identity.id) {
    (component as unknown as { id: string }).id = identity.id;
  }
  if (identity.label) {
    (component as unknown as { label: string }).label = identity.label;
  }
  if (identity.pinIds) {
    for (const pin of component.pins) {
      const targetId = identity.pinIds[pin.name];
      if (targetId) {
        (pin as unknown as { id: string }).id = targetId;
      }
    }
  }
}

export function applyNodeIdentity(node: Node, id?: string): void {
  if (id) {
    (node as unknown as { id: string }).id = id;
  }
}

export function applyPinIdentity(pin: Pin, id?: string): void {
  if (id) {
    (pin as unknown as { id: string }).id = id;
  }
}