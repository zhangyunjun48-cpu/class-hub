-- 把初始化时写入的站点名改成中性默认值。
-- 说明：0001/0002 已经应用到现有部署，迁移器会校验 checksum，
-- 因此这里只新增一条更新语句，不修改历史迁移文件。

UPDATE app_meta
   SET app_name = 'Class Hub',
       updated_at = now()
 WHERE app_name = '山东大学智软芯片新工科实验班 11 班共享站';