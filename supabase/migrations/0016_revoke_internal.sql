-- chat_audience and tasks_notify are only called by other SECURITY DEFINER functions
revoke execute on function chat_audience(uuid), tasks_notify() from authenticated;
