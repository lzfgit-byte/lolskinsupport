import useGlobalState from '@/hooks/use-global-state';

export default () => {
  const { drawerOpen } = useGlobalState();

  const handleDrawOpen = () => {
    drawerOpen.value = true;
  };

  return {
    drawerOpen,
    handleDrawOpen,
  };
};
