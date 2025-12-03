export interface MenuItem{
  title:string;
  path:string;
  icon:string;
  children?:MenuItem[];
}