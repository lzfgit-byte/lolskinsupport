import { watch } from 'vue-demi';

export default (props: Record<string, any>, expose: Record<string, any>) => {
  watch(
    () => props.imagesArr,
    () => {
      if (props.imagesArr.length > 0) {
        expose.show(props.imagesArr);
      }
    }
  );
};
