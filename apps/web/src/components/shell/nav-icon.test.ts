import { MODULE_KEYS } from '@masari/db';
import { describe, expect, it } from 'vitest';
import { MODULE_REGISTRY } from '@/modules/registry';
import ar from '../../../messages/ar.json';
import en from '../../../messages/en.json';
import { NAV_ICONS } from './nav-icon';

// Every icon the registry and the navigation name exists in the pinned lucide-react (no silent fallback),
// and every module has a name and a description in both catalogs (contracts/permissions.md §4).
describe('navigation icons and module texts', () => {
  it.each(MODULE_KEYS)('resolves the icon of %s', (key) => {
    expect(NAV_ICONS[MODULE_REGISTRY[key].icon]).toBeDefined();
  });

  it('resolves the Home icon and every icon in the map', () => {
    expect(NAV_ICONS.House).toBeDefined();
    for (const icon of Object.values(NAV_ICONS)) expect(icon).toBeDefined();
  });

  it.each(MODULE_KEYS)('names and describes %s in both catalogs', (key) => {
    for (const catalog of [ar, en]) {
      expect(catalog.modules[key].name.trim()).not.toBe('');
      expect(catalog.modules[key].description.trim()).not.toBe('');
    }
  });
});
