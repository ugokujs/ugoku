import DefaultTheme from 'vitepress/theme';
import { setupVitePressMount } from '@ugoku/vitepress';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    setupVitePressMount(router);
  },
};
