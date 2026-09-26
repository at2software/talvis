import { Service } from '@angular/core';
import { Comment } from '@models/comment/comment.model';
import { TalvisHttpService } from '../http/http.talvis';

@Service()
export class CommentService extends TalvisHttpService<Comment> {
    public apiPath = 'comments';
    override readonly model = Comment;
    indexFor = (path: string) => this.aget(path + '/comments');
}
