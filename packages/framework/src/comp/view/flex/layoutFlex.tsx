import { SysViewProps } from '@view/interface';
import CompFactory from '../../compFactory';
import { FlexDirection, LayoutFlexProps } from './interface';
import { useView } from '@/stores/store/useView';

const LayoutFlex: React.FC<SysViewProps> = (props) => {
  const [view] = useView<LayoutFlexProps>(props.viewId);
  const { direction = FlexDirection.COLUMN, gutter = 12 } = view;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    gap: `${gutter}px`,
  };

  return (
    <div style={containerStyle}>
      {view.children?.map((id, index) => (
        <CompFactory key={`${index}_${id}`} viewId={id} />
      ))}
    </div>
  );
};

export default LayoutFlex;
