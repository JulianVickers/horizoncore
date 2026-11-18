// @ts-check
/// <reference types="@super-productivity/plugin-api/global" />

/*
 * Focus Dealer — host-side code.
 *
 * Deliberately minimal: all dealing logic lives in the iframe view
 * (index.html), computed lazily and stored keyed by date, so opening the
 * view on any synced device yields the same card without write races.
 * This file only adds the way in.
 */
PluginAPI.registerHeaderButton({
  label: 'Focus Card',
  icon: 'style',
  onClick: function () {
    PluginAPI.showIndexHtmlAsView();
  },
});
