import { SysViewProps } from '@view/interface';
import CompFactory from '../../compFactory';
import { FlexDirection, LayoutFlexProps } from './interface';

const LayoutFlex: React.FC<SysViewProps<LayoutFlexProps>> = (props) => {
  const { view } = props;
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
