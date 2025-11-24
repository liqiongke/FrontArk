import { CtrlBase, Ctrl } from '@ctrl/interface';

export interface CtrlUploadProps extends CtrlBase {
  type: Ctrl.Upload;
  accept?: string; // 接受的文件类型
  multiple?: boolean; // 是否支持多选文件
  maxSize?: number; // 文件大小限制（MB）
  maxCount?: number; // 最大上传数量
  action?: string; // 上传的URL
  onUploadSuccess?: (file: any, response: any) => void; // 上传成功回调
  onUploadError?: (error: any) => void; // 上传失败回调
}
