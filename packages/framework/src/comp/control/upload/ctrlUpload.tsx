import { useSafeState } from 'ahooks';
import { isUndefined } from 'lodash';
import { Upload, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { type SysCtrlProps } from '../interface';
import notify from '@/utils/notify';
import { Button } from '@/ui/components/button';
import { Progress } from '@/ui/components/progress';
import { cn } from '@/ui/lib/utils';
import { type CtrlUploadProps } from './interface';

/**
 * 框架自有上传文件对象:保留 uid/name/status/response/原始 File 等回调用途,
 * 不把第三方类型泄漏到公开 API
 */
interface UploadItem {
  uid: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'error' | 'removed';
  percent: number;
  response?: unknown;
  error?: unknown;
  raw: File;
  xhr?: XMLHttpRequest;
}

let uidSeed = 0;

const CtrlUpload: React.FC<SysCtrlProps<CtrlUploadProps>> = (props) => {
  const { ctrl } = props;
  const [fileList, setFileList] = useSafeState<UploadItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // 已移除条目的取消不触发成功/失败回调
  const fileListRef = useRef<UploadItem[]>([]);
  fileListRef.current = fileList;

  useEffect(() => {
    // 卸载时取消全部进行中的上传,避免状态更新到已卸载组件
    const items = fileListRef.current;
    items.forEach((item) => {
      if (item.status === 'uploading') {
        item.xhr?.abort();
      }
    });
  }, []);

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

  const updateItem = (uid: string, patch: Partial<UploadItem>) => {
    setFileList((prev) => prev.map((item) => (item.uid === uid ? { ...item, ...patch } : item)));
  };

  const removeItem = (uid: string) => {
    const item = fileListRef.current.find((it) => it.uid === uid);
    if (item?.status === 'uploading') {
      // abort 触发 onabort,不会走 success/error 回调
      item.xhr?.abort();
    }
    setFileList((prev) => prev.filter((it) => it.uid !== uid));
  };

  const startUpload = (raw: File) => {
    const uid = `${Date.now()}_${uidSeed++}`;
    const item: UploadItem = {
      uid,
      name: raw.name,
      size: raw.size,
      status: 'uploading',
      percent: 0,
      raw,
    };
    setFileList((prev) => [...prev, item]);

    const formData = new FormData();
    // 上传字段名保持 'file' 与历史服务端约定一致
    formData.append('file', raw);

    const xhr = new XMLHttpRequest();
    item.xhr = xhr;
    xhr.open('POST', action || '/api/upload', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        updateItem(uid, { percent });
      }
    };

    const isRemoved = () => !fileListRef.current.some((it) => it.uid === uid);

    const handleSuccess = () => {
      if (isRemoved()) {
        return;
      }
      let response: unknown = undefined;
      try {
        response = JSON.parse(xhr.responseText);
      } catch {
        response = xhr.responseText;
      }
      updateItem(uid, { status: 'done', percent: 100, response });
      notify.success(`${item.name} 上传成功`);
      onUploadSuccess?.({ uid, name: item.name, size: item.size, status: 'done' }, response);
    };

    const handleError = (messageText: string) => {
      if (isRemoved()) {
        return;
      }
      updateItem(uid, { status: 'error', error: new Error(messageText) });
      notify.error(`${item.name} 上传失败`, messageText);
      onUploadError?.(new Error(messageText));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        handleSuccess();
      } else {
        handleError(`服务端返回状态码 ${xhr.status}`);
      }
    };
    xhr.onerror = () => handleError('网络错误');
    xhr.ontimeout = () => handleError('请求超时');
    xhr.onabort = () => {
      // 取消不触发成功/失败回调
    };

    xhr.send(formData);
  };

  const onPickFiles = (picked: FileList | null) => {
    if (!picked) {
      return;
    }
    const incoming = Array.from(picked);
    // 数量限制:累计不超过 maxCount
    let remain = maxCount === undefined ? Infinity : maxCount - fileListRef.current.length;
    for (const raw of incoming) {
      if (remain <= 0) {
        notify.error(`最多上传 ${maxCount} 个文件`);
        break;
      }
      // 大小限制(MB)
      if (maxSize !== undefined && raw.size / 1024 / 1024 > maxSize) {
        notify.error(`${raw.name} 大小超过限制`, `文件大小不能超过 ${maxSize}MB`);
        continue;
      }
      startUpload(raw);
      remain--;
    }
    // 重置 input,允许再次选择同一文件
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="ctrl-upload flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={(event) => onPickFiles(event.target.files)}
      />
      <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={ctrl?.disabled}>
        <Upload />
        上传文件
      </Button>

      {fileList.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {fileList.map((item) => (
            <li
              key={item.uid}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm',
                item.status === 'error' && 'border-destructive/50',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate" title={item.name}>
                    {item.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`移除 ${item.name}`}
                    className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={() => removeItem(item.uid)}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {item.status === 'uploading' && (
                  <Progress value={item.percent} className="mt-1 h-1.5" />
                )}
                {item.status === 'error' && (
                  <span className="text-destructive text-xs">上传失败</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CtrlUpload;
