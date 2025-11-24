import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { Button, Upload, message } from 'antd';
import { isUndefined } from 'lodash';
import { useState } from 'react';
import { SysCtrlProps } from '../interface';
import './index.less';
import { CtrlUploadProps } from './interface';

const CtrlUpload: React.FC<SysCtrlProps<CtrlUploadProps>> = (props) => {
  const { ctrl } = props;
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  if (isUndefined(ctrl)) {
    return null;
  }

  const {
    accept,
    multiple = false,
    maxSize,
    maxCount,
    action,
    onUploadSuccess,
    onUploadError,
  } = ctrl;

  const handleChange: UploadProps['onChange'] = (info) => {
    setFileList(info.fileList);

    if (info.file.status === 'done') {
      message.success(`${info.file.name} 上传成功`);
      onUploadSuccess?.(info.file, info.file.response);
    } else if (info.file.status === 'error') {
      message.error(`${info.file.name} 上传失败`);
      onUploadError?.(info.file.error);
    }
  };

  const beforeUpload = (file: File) => {
    if (maxSize && file.size / 1024 / 1024 > maxSize) {
      message.error(`文件大小不能超过 ${maxSize}MB`);
      return false;
    }
    return true;
  };

  const uploadProps: UploadProps = {
    name: 'file',
    action: action || '/api/upload',
    accept,
    multiple,
    maxCount,
    fileList,
    onChange: handleChange,
    beforeUpload,
  };

  return (
    <div className="ctrl-upload">
      <Upload {...uploadProps}>
        <Button icon={<UploadOutlined />}>上传文件</Button>
      </Upload>
    </div>
  );
};

export default CtrlUpload;
