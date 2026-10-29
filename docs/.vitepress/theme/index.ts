import DefaultTheme from 'vitepress/theme';
import { setupVitePressMount } from '@ugoku/vitepress/client';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    setupVitePressMount(router);
  },
};
